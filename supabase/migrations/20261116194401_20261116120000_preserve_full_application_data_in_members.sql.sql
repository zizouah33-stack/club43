/*
# Preserve full membership application data in the member profile

1. Modified tables
- `members`: adds columns copied from the application at approval time:
  - `first_name`, `last_name` (text, nullable) — given name and family name.
  - `gender` (text, nullable, 'male'/'female') — applicant gender.
  - `education_or_job` (text, not null, default '') — study level or occupation.
  - `interests` (text[], not null, default '{}') — chosen interest areas.
  - `motivation` (text, not null, default '') — motivation text from the form.
  - `guardian_name`, `guardian_phone` (text, nullable) — guardian data for minors.
  - `guardian_consent` (boolean, not null, default false) — guardian consent.
  - `bylaws_accepted` (boolean, not null, default false) — accepted the internal bylaws.
  - `application_submitted_at` (timestamptz, nullable) — when the application was submitted.

2. Security
- No new grants: `members` already has its existing grants; the new columns inherit
  table-level grants. Member self-update stays restricted to the existing columns
  (phone, address, photo_url, must_change_password) — new columns are NOT added to
  that column-restricted grant, so members cannot edit their own profile data.
- Staff read access unchanged (is_staff policy).

3. Data migration
- Existing members get their missing fields backfilled from their original
  application via `application_id` (no data destroyed).

4. Approval flow
- `finalize_membership_approval` now copies ALL application fields into the member
  row at approval time, including guardian data, education, interests, motivation,
  consents, and submission timestamp.
*/

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS education_or_job text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS interests text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS motivation text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS guardian_name text,
  ADD COLUMN IF NOT EXISTS guardian_phone text,
  ADD COLUMN IF NOT EXISTS guardian_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bylaws_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS application_submitted_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'members_gender_check'
  ) THEN
    ALTER TABLE members
      ADD CONSTRAINT members_gender_check CHECK (gender IS NULL OR gender IN ('male', 'female'));
  END IF;
END $$;

-- Backfill existing members from their original applications (only fills blanks,
-- never overwrites non-empty member data).
UPDATE members m
SET
  first_name = coalesce(m.first_name, split_part(a.first_name, '', 1) IS NULL::text::text, a.first_name),
  last_name = coalesce(m.last_name, a.last_name),
  gender = coalesce(m.gender, a.gender),
  education_or_job = CASE WHEN m.education_or_job = '' THEN a.education_or_job ELSE m.education_or_job END,
  interests = CASE WHEN m.interests = '{}' THEN a.interests ELSE m.interests END,
  motivation = CASE WHEN m.motivation = '' THEN a.motivation ELSE m.motivation END,
  guardian_name = coalesce(m.guardian_name, a.guardian_name),
  guardian_phone = coalesce(m.guardian_phone, a.guardian_phone),
  guardian_consent = CASE WHEN NOT m.guardian_consent THEN a.guardian_consent ELSE m.guardian_consent END,
  bylaws_accepted = CASE WHEN NOT m.bylaws_accepted THEN a.bylaws_accepted ELSE m.bylaws_accepted END,
  application_submitted_at = coalesce(m.application_submitted_at, a.created_at)
FROM membership_applications a
WHERE m.application_id = a.id;

CREATE OR REPLACE FUNCTION public.finalize_membership_approval(p_application uuid, p_user uuid, p_admin uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app public.membership_applications%ROWTYPE;
  m public.members%ROWTYPE;
BEGIN
  SELECT * INTO app FROM public.membership_applications WHERE id = p_application FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF app.status = 'rejected' THEN
    RAISE EXCEPTION 'ALREADY_REJECTED';
  END IF;
  IF app.membership_number IS NULL THEN
    RAISE EXCEPTION 'NOT_PREPARED';
  END IF;

  SELECT * INTO m FROM public.members WHERE application_id = app.id;
  IF FOUND THEN
    RETURN jsonb_build_object('member_id', m.id, 'membership_number', m.membership_number, 'created', false);
  END IF;

  INSERT INTO public.members (
    id, membership_number, application_id, full_name, birth_date, real_email, phone, address,
    first_name, last_name, gender, education_or_job, interests, motivation,
    guardian_name, guardian_phone, guardian_consent, bylaws_accepted, application_submitted_at,
    must_change_password
  )
  VALUES (
    p_user,
    app.membership_number,
    app.id,
    coalesce(app.first_name || ' ' || app.last_name, app.full_name),
    app.birth_date,
    app.email,
    app.phone,
    app.address,
    app.first_name,
    app.last_name,
    app.gender,
    app.education_or_job,
    app.interests,
    app.motivation,
    app.guardian_name,
    app.guardian_phone,
    app.guardian_consent,
    app.bylaws_accepted,
    app.created_at,
    true
  );

  UPDATE public.membership_applications
  SET status = 'approved', approved_by = p_admin, approved_at = now(), reviewed_at = now(), rejection_reason = NULL
  WHERE id = app.id;

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
  VALUES (p_admin, 'approve_application', 'membership_application', app.id::text, jsonb_build_object('membership_number', app.membership_number));

  RETURN jsonb_build_object('member_id', p_user, 'membership_number', app.membership_number, 'created', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_membership_approval(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_membership_approval(uuid, uuid, uuid) TO service_role;
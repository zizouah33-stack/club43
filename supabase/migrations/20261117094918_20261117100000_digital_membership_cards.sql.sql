/*
# Add official digital membership cards

## 1. Plain-language summary
- Adds the member's club membership category to the existing `members` table.
- Adds a current-card table and an append-only card-version table linked to the existing member record.
- The official card image remains the only visual template: `public/templates/بطاقة_الانخراط.jpeg`.
- The browser generates the final PNG/PDF from that template and stores only the secure card state and version snapshots in Supabase.

## 2. Modified tables
- `members`
  - `member_role`: controlled category: enrolled, member, honorary member, or club presidency.

## 3. New tables
- `membership_cards`
  - One current card row per existing member.
  - Stores active/revoked state, current version, issue time, last update time, and the staff member who last regenerated it.
- `membership_card_versions`
  - Immutable history of every generated card version.
  - Stores only the values printed on the official template and the QR payload, which is the membership number only.

## 4. Approval flow
- Adds `finalize_membership_approval_with_role`, used by the approval Edge Function.
- Approval accepts a controlled membership category, keeps the existing official membership number, creates the member card, and records version 1.
- Existing members receive a card and version 1 from their existing membership data without changing membership numbers.

## 5. Security
- Both new tables have RLS enabled.
- Authenticated members can read only their own card and card history.
- Staff can read all cards and histories through the existing `is_staff()` security function.
- Only the service role can create or update cards and versions; browsers cannot change membership numbers, categories, QR payloads, or card history directly.
- Anonymous users receive no access.

## 6. Important notes
1. The QR payload is exactly the membership number and contains no personal information.
2. Card files are generated in the signed-in browser from the official local template; no public storage bucket is introduced.
3. Suspending or expelling a member revokes the current card; reactivation restores its active state without changing the number.
*/

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS member_role text NOT NULL DEFAULT 'enrolled';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'members_member_role_check'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_member_role_check
      CHECK (member_role IN ('enrolled', 'member', 'honorary', 'presidency'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.membership_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL UNIQUE REFERENCES public.members(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  current_version integer NOT NULL DEFAULT 1 CHECK (current_version > 0),
  issued_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.membership_card_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.membership_cards(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  membership_number text NOT NULL,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  member_role text NOT NULL CHECK (member_role IN ('enrolled', 'member', 'honorary', 'presidency')),
  qr_payload text NOT NULL,
  template_path text NOT NULL DEFAULT 'templates/بطاقة_الانخراط.jpeg',
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, version)
);

CREATE INDEX IF NOT EXISTS membership_cards_status_idx ON public.membership_cards(status);
CREATE INDEX IF NOT EXISTS membership_card_versions_member_idx ON public.membership_card_versions(member_id, created_at DESC);

ALTER TABLE public.membership_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_card_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.membership_cards FROM anon, authenticated;
REVOKE ALL ON public.membership_card_versions FROM anon, authenticated;
GRANT SELECT ON public.membership_cards, public.membership_card_versions TO authenticated;
GRANT ALL ON public.membership_cards, public.membership_card_versions TO service_role;

DROP POLICY IF EXISTS "member_read_own_card" ON public.membership_cards;
CREATE POLICY "member_read_own_card" ON public.membership_cards
  FOR SELECT TO authenticated
  USING (member_id = auth.uid() OR public.is_staff());

DROP POLICY IF EXISTS "member_read_own_card_versions" ON public.membership_card_versions;
CREATE POLICY "member_read_own_card_versions" ON public.membership_card_versions
  FOR SELECT TO authenticated
  USING (member_id = auth.uid() OR public.is_staff());

INSERT INTO public.membership_cards (member_id, status, current_version, issued_at, updated_at)
SELECT id, CASE WHEN status = 'active' THEN 'active' ELSE 'revoked' END, 1, joined_at, updated_at
FROM public.members
ON CONFLICT (member_id) DO NOTHING;

INSERT INTO public.membership_card_versions (
  card_id, member_id, version, membership_number, first_name, last_name, member_role, qr_payload, template_path
)
SELECT
  c.id,
  m.id,
  1,
  m.membership_number,
  coalesce(m.first_name, split_part(m.full_name, ' ', 1)),
  coalesce(m.last_name, nullif(btrim(substr(m.full_name, length(split_part(m.full_name, ' ', 1)) + 1)), '')),
  m.member_role,
  m.membership_number,
  'templates/بطاقة_الانخراط.jpeg'
FROM public.membership_cards c
JOIN public.members m ON m.id = c.member_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.membership_card_versions v WHERE v.card_id = c.id
);

CREATE OR REPLACE FUNCTION public.finalize_membership_approval_with_role(
  p_application uuid,
  p_user uuid,
  p_admin uuid,
  p_member_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app public.membership_applications%ROWTYPE;
  m public.members%ROWTYPE;
  v_card public.membership_cards%ROWTYPE;
  v_created_card boolean := false;
BEGIN
  IF p_member_role NOT IN ('enrolled', 'member', 'honorary', 'presidency') THEN
    RAISE EXCEPTION 'INVALID_MEMBER_ROLE';
  END IF;

  SELECT * INTO app FROM public.membership_applications WHERE id = p_application FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF app.status = 'rejected' THEN RAISE EXCEPTION 'ALREADY_REJECTED'; END IF;
  IF app.membership_number IS NULL THEN RAISE EXCEPTION 'NOT_PREPARED'; END IF;

  SELECT * INTO m FROM public.members WHERE application_id = app.id;
  IF FOUND THEN
    UPDATE public.members
    SET member_role = p_member_role, updated_at = now()
    WHERE id = m.id
    RETURNING * INTO m;
  ELSE
    INSERT INTO public.members (
      id, membership_number, application_id, full_name, birth_date, real_email, phone, address,
      first_name, last_name, gender, education_or_job, interests, motivation,
      guardian_name, guardian_phone, guardian_consent, bylaws_accepted, application_submitted_at,
      member_role, must_change_password
    )
    VALUES (
      p_user, app.membership_number, app.id, coalesce(app.first_name || ' ' || app.last_name, app.full_name),
      app.birth_date, app.email, app.phone, app.address, app.first_name, app.last_name, app.gender,
      app.education_or_job, app.interests, app.motivation, app.guardian_name, app.guardian_phone,
      app.guardian_consent, app.bylaws_accepted, app.created_at, p_member_role, true
    )
    RETURNING * INTO m;
  END IF;

  INSERT INTO public.membership_cards (member_id, status, current_version, issued_at, updated_at, last_generated_by)
  VALUES (m.id, 'active', 1, coalesce(m.joined_at, now()), now(), p_admin)
  ON CONFLICT (member_id) DO NOTHING
  RETURNING * INTO v_card;

  IF v_card.id IS NOT NULL THEN
    v_created_card := true;
    INSERT INTO public.membership_card_versions (
      card_id, member_id, version, membership_number, first_name, last_name, member_role, qr_payload, generated_by
    ) VALUES (
      v_card.id, m.id, 1, m.membership_number, coalesce(m.first_name, ''), coalesce(m.last_name, ''),
      m.member_role, m.membership_number, p_admin
    );
  END IF;

  UPDATE public.membership_applications
  SET status = 'approved', approved_by = p_admin, approved_at = now(), reviewed_at = now(), rejection_reason = NULL
  WHERE id = app.id;

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
  VALUES (p_admin, 'approve_application', 'membership_application', app.id::text,
    jsonb_build_object('membership_number', m.membership_number, 'member_role', m.member_role, 'card_created', v_created_card));

  RETURN jsonb_build_object('member_id', m.id, 'membership_number', m.membership_number, 'member_role', m.member_role, 'card_created', v_created_card);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalize_membership_approval_with_role(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_membership_approval_with_role(uuid, uuid, uuid, text) TO service_role;
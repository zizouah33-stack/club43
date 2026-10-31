/*
# Membership applications: secure public submission and staff review

1. Changes to membership_applications
- New columns: first_name, last_name, gender, address, education_or_job, bylaws_accepted, guardian_consent, rejection_reason, reviewed_at, client_ip_hash.
- A partial unique index blocks a second pending application with the same email (case-insensitive).
- The table is added to the realtime publication so staff see new applications live.

2. Submission function
- submit_membership_application() validates every field on the server, requires guardian details for applicants under 18, rejects duplicate pending emails, and allows at most 3 submissions per client IP per hour.
- The client IP is stored only as an md5 hash in client_ip_hash.
- Public roles can execute the function but cannot read or write the table directly.

3. Security
- The direct anonymous INSERT grant and policy are removed. All public submissions go through the function.
- Anonymous visitors and applicants have no SELECT access to any application row.
- Admin and editor accounts (is_staff) keep full read, update and delete access.

4. Important notes
- Birth dates are only readable by staff.
- The function runs with SECURITY DEFINER and a fixed search_path.
*/

ALTER TABLE membership_applications
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS education_or_job text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bylaws_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guardian_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_ip_hash text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'membership_applications_gender_check') THEN
    ALTER TABLE membership_applications
      ADD CONSTRAINT membership_applications_gender_check CHECK (gender IS NULL OR gender IN ('male', 'female'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS membership_applications_pending_email_key
  ON membership_applications (lower(email)) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS membership_applications_ip_created_idx
  ON membership_applications (client_ip_hash, created_at);

DROP POLICY IF EXISTS "public_insert_memberships" ON membership_applications;
REVOKE INSERT ON membership_applications FROM anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'membership_applications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE membership_applications;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.submit_membership_application(
  p_first_name text,
  p_last_name text,
  p_birth_date date,
  p_gender text,
  p_email text,
  p_phone text,
  p_address text,
  p_education_or_job text,
  p_interests text[],
  p_motivation text,
  p_guardian_name text,
  p_guardian_phone text,
  p_guardian_consent boolean,
  p_bylaws_accepted boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_address text := btrim(coalesce(p_address, ''));
  v_job text := btrim(coalesce(p_education_or_job, ''));
  v_motivation text := btrim(coalesce(p_motivation, ''));
  v_guardian_name text := nullif(btrim(coalesce(p_guardian_name, '')), '');
  v_guardian_phone text := nullif(btrim(coalesce(p_guardian_phone, '')), '');
  v_headers json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  v_ip text := coalesce(split_part(v_headers ->> 'x-forwarded-for', ',', 1), 'unknown');
  v_ip_hash text := md5(btrim(v_ip));
  v_age integer;
  v_recent integer;
  v_id uuid;
BEGIN
  IF p_birth_date IS NULL OR p_birth_date > current_date OR p_birth_date < DATE '1930-01-01' THEN
    RAISE EXCEPTION 'VALIDATION';
  END IF;
  IF length(v_first) NOT BETWEEN 2 AND 60 OR length(v_last) NOT BETWEEN 2 AND 60 THEN
    RAISE EXCEPTION 'VALIDATION';
  END IF;
  IF p_gender IS NULL OR p_gender NOT IN ('male', 'female') THEN
    RAISE EXCEPTION 'VALIDATION';
  END IF;
  IF length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'VALIDATION';
  END IF;
  IF v_phone !~ '^\+?[0-9 ]{8,20}$' THEN
    RAISE EXCEPTION 'VALIDATION';
  END IF;
  IF length(v_address) NOT BETWEEN 3 AND 200 OR length(v_job) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'VALIDATION';
  END IF;
  IF length(v_motivation) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'VALIDATION';
  END IF;
  IF p_interests IS NULL OR cardinality(p_interests) = 0
     OR NOT (p_interests <@ ARRAY['علوم', 'تكنولوجيا', 'سياحة', 'ثقافة']::text[]) THEN
    RAISE EXCEPTION 'VALIDATION';
  END IF;
  IF NOT coalesce(p_bylaws_accepted, false) THEN
    RAISE EXCEPTION 'VALIDATION';
  END IF;

  v_age := date_part('year', age(current_date, p_birth_date))::integer;
  IF v_age < 18 AND (v_guardian_name IS NULL OR v_guardian_phone IS NULL OR NOT coalesce(p_guardian_consent, false)) THEN
    RAISE EXCEPTION 'VALIDATION';
  END IF;

  IF EXISTS (SELECT 1 FROM membership_applications WHERE lower(email) = v_email AND status = 'pending') THEN
    RAISE EXCEPTION 'DUPLICATE_PENDING';
  END IF;

  SELECT count(*) INTO v_recent
  FROM membership_applications
  WHERE client_ip_hash = v_ip_hash AND created_at > now() - interval '1 hour';
  IF v_recent >= 3 THEN
    RAISE EXCEPTION 'RATE_LIMITED';
  END IF;

  INSERT INTO membership_applications (
    full_name, first_name, last_name, birth_date, gender, email, phone, address, education_or_job,
    interests, motivation, guardian_name, guardian_phone, guardian_consent, bylaws_accepted, client_ip_hash
  ) VALUES (
    v_first || ' ' || v_last, v_first, v_last, p_birth_date, p_gender, v_email, v_phone, v_address, v_job,
    p_interests, v_motivation, v_guardian_name, v_guardian_phone, coalesce(p_guardian_consent, false), true, v_ip_hash
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_membership_application(text, text, date, text, text, text, text, text, text[], text, text, text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_membership_application(text, text, date, text, text, text, text, text, text[], text, text, text, boolean, boolean) TO anon, authenticated;

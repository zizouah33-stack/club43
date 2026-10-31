/*
# Membership system core: members, admin roles, counters, logs and approval functions

1. New tables
- admin_emails: whitelist of emails that become administrators (seeded with the club administrator).
- admin_users: one row per administrator or editor, linked to the Auth account.
- membership_counters: yearly counter (year, last_value) used to build EM-YYYY-NNN numbers.
- members: one row per approved member, id = Auth user id. Holds membership number, birth date, status and first-login flag.
- email_logs: every automatic email attempt with status and error.
- audit_log: administrative operations (approve, reject, suspend, reactivate, expel, password reset).

2. Changes to existing tables
- membership_applications: adds membership_number (unique), approved_by, approved_at.
- Authenticated users lose direct UPDATE on membership_applications. Status changes go through server functions only.
- is_staff() and is_admin() now also read admin_users. Existing profiles-based roles keep working.

3. Storage
- New private bucket member-photos. Each member can only manage files inside their own folder; staff can read.

4. Security
- Role tables and counters are not readable by anonymous or member roles.
- Members can read and update only their own row, and only while their status is active.
- Members can update only phone, address, photo_url and must_change_password. Membership number, birth date, status and role are not writable by members.
- Approval, rejection, status changes and email logging run with the service role inside Edge Functions.
- Functions that allocate numbers and finalize approvals are executable only by the service role.

5. Important notes
- The administrator trigger and claim_admin_role() only grant admin when the Auth email is confirmed and listed in admin_emails.
- Public self-signup must be disabled in the Supabase dashboard so nobody can register the administrator email first.
*/

CREATE TABLE IF NOT EXISTS admin_emails (
  email text PRIMARY KEY,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'editor')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_emails FROM anon, authenticated;
GRANT ALL ON admin_emails TO service_role;
INSERT INTO admin_emails (email, role) VALUES ('ahraouziad6@gmail.com', 'admin') ON CONFLICT (email) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'editor')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_users FROM anon, authenticated;
GRANT SELECT ON admin_users TO authenticated;
GRANT ALL ON admin_users TO service_role;
DROP POLICY IF EXISTS "own_admin_row" ON admin_users;
CREATE POLICY "own_admin_row" ON admin_users FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.grant_admin_from_whitelist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL THEN
    INSERT INTO public.admin_users (user_id, role)
    SELECT NEW.id, ae.role FROM public.admin_emails ae WHERE lower(ae.email) = lower(NEW.email)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.grant_admin_from_whitelist() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS grant_admin_on_signup ON auth.users;
CREATE TRIGGER grant_admin_on_signup
AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_admin_from_whitelist();

CREATE OR REPLACE FUNCTION public.claim_admin_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_confirmed timestamptz;
  v_role text;
BEGIN
  SELECT lower(email), email_confirmed_at INTO v_email, v_confirmed FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL OR v_confirmed IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT role INTO v_role FROM public.admin_emails WHERE lower(email) = v_email;
  IF v_role IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.admin_users (user_id, role) VALUES (auth.uid(), v_role)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN v_role;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_admin_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_admin_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'editor'));
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND role = 'admin')
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE TABLE IF NOT EXISTS membership_counters (
  year integer PRIMARY KEY,
  last_value integer NOT NULL DEFAULT 0 CHECK (last_value >= 0)
);
ALTER TABLE membership_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON membership_counters FROM anon, authenticated;
GRANT ALL ON membership_counters TO service_role;

ALTER TABLE membership_applications
  ADD COLUMN IF NOT EXISTS membership_number text UNIQUE,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;
REVOKE UPDATE ON membership_applications FROM authenticated;

CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  membership_number text NOT NULL UNIQUE,
  application_id uuid UNIQUE REFERENCES membership_applications(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  birth_date date NOT NULL,
  real_email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  photo_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expelled')),
  must_change_password boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON members FROM anon, authenticated;
GRANT SELECT ON members TO authenticated;
GRANT UPDATE (phone, address, photo_url, must_change_password) ON members TO authenticated;
GRANT ALL ON members TO service_role;
DROP POLICY IF EXISTS "member_select_own_active" ON members;
CREATE POLICY "member_select_own_active" ON members FOR SELECT TO authenticated
  USING (id = auth.uid() AND status = 'active');
DROP POLICY IF EXISTS "member_update_own_active" ON members;
CREATE POLICY "member_update_own_active" ON members FOR UPDATE TO authenticated
  USING (id = auth.uid() AND status = 'active') WITH CHECK (id = auth.uid() AND status = 'active');
DROP POLICY IF EXISTS "staff_select_members" ON members;
CREATE POLICY "staff_select_members" ON members FOR SELECT TO authenticated USING (public.is_staff());

CREATE TABLE IF NOT EXISTS email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES membership_applications(id) ON DELETE SET NULL,
  recipient text NOT NULL,
  email_type text NOT NULL CHECK (email_type IN ('application_received', 'approval', 'rejection')),
  subject text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON email_logs FROM anon, authenticated;
GRANT SELECT ON email_logs TO authenticated;
GRANT ALL ON email_logs TO service_role;
DROP POLICY IF EXISTS "staff_select_email_logs" ON email_logs;
CREATE POLICY "staff_select_email_logs" ON email_logs FOR SELECT TO authenticated USING (public.is_staff());
CREATE INDEX IF NOT EXISTS email_logs_application_idx ON email_logs (application_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON audit_log FROM anon, authenticated;
GRANT SELECT ON audit_log TO authenticated;
GRANT ALL ON audit_log TO service_role;
DROP POLICY IF EXISTS "staff_select_audit_log" ON audit_log;
CREATE POLICY "staff_select_audit_log" ON audit_log FOR SELECT TO authenticated USING (public.is_staff());

CREATE OR REPLACE FUNCTION public.prepare_membership_approval(p_application uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app public.membership_applications%ROWTYPE;
  v_year integer := extract(year FROM now())::integer;
  v_last integer;
  v_number text;
BEGIN
  SELECT * INTO app FROM public.membership_applications WHERE id = p_application FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF app.status = 'rejected' THEN
    RAISE EXCEPTION 'ALREADY_REJECTED';
  END IF;

  IF app.membership_number IS NULL THEN
    INSERT INTO public.membership_counters (year, last_value) VALUES (v_year, 1)
    ON CONFLICT (year) DO UPDATE SET last_value = public.membership_counters.last_value + 1
    RETURNING last_value INTO v_last;
    v_number := 'EM-' || v_year::text || '-' || lpad(v_last::text, 3, '0');
    UPDATE public.membership_applications SET membership_number = v_number WHERE id = app.id;
  ELSE
    v_number := app.membership_number;
  END IF;

  RETURN jsonb_build_object(
    'application_id', app.id,
    'status', app.status,
    'membership_number', v_number,
    'full_name', coalesce(app.first_name || ' ' || app.last_name, app.full_name),
    'birth_date', app.birth_date,
    'email', app.email,
    'phone', app.phone,
    'address', app.address
  );
END;
$$;

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

  INSERT INTO public.members (id, membership_number, application_id, full_name, birth_date, real_email, phone, address, must_change_password)
  VALUES (
    p_user,
    app.membership_number,
    app.id,
    coalesce(app.first_name || ' ' || app.last_name, app.full_name),
    app.birth_date,
    app.email,
    app.phone,
    app.address,
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

CREATE OR REPLACE FUNCTION public.reject_membership_application(p_application uuid, p_admin uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app public.membership_applications%ROWTYPE;
BEGIN
  SELECT * INTO app FROM public.membership_applications WHERE id = p_application FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF app.status = 'approved' THEN
    RAISE EXCEPTION 'ALREADY_APPROVED';
  END IF;
  IF app.status = 'rejected' THEN
    RETURN jsonb_build_object('changed', false);
  END IF;

  UPDATE public.membership_applications
  SET status = 'rejected', rejection_reason = nullif(btrim(p_reason), ''), reviewed_at = now()
  WHERE id = app.id;

  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
  VALUES (p_admin, 'reject_application', 'membership_application', app.id::text, jsonb_build_object('reason', nullif(btrim(p_reason), '')));

  RETURN jsonb_build_object('changed', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prepare_membership_approval(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_membership_approval(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_membership_application(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_membership_approval(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_membership_approval(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_membership_application(uuid, uuid, text) TO service_role;

INSERT INTO storage.buckets (id, name, public) VALUES ('member-photos', 'member-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "member_photos_select" ON storage.objects;
CREATE POLICY "member_photos_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'member-photos' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_staff()));
DROP POLICY IF EXISTS "member_photos_insert" ON storage.objects;
CREATE POLICY "member_photos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'member-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "member_photos_update" ON storage.objects;
CREATE POLICY "member_photos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'member-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'member-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "member_photos_delete" ON storage.objects;
CREATE POLICY "member_photos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'member-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

/*
# Super admin role, staff management, and privilege hardening

## 1. Summary
- Adds a SUPER_ADMIN role that is separate from ordinary admins and editors.
- Adds server-side functions that let only a SUPER_ADMIN add, change or remove staff accounts. Every change is written to the audit log.
- Adds a one-time setup record used by the super admin provisioning function.
- Removes dangerous table privileges that anonymous visitors and signed-in users had. Row level security does not block TRUNCATE, so these grants were a real risk.

## 2. Changed tables
- admin_users: role may now be super_admin, admin or editor. New column display_name (optional).
- admin_emails: role may now be super_admin, admin or editor. The club administrator email is set to super_admin.

## 3. New tables
- system_setup: one row per completed one-time setup step. Only the server (service role) can read or write it.

## 4. New functions (all check server-side that the caller is a SUPER_ADMIN)
- is_super_admin(): true when the signed-in user is a SUPER_ADMIN.
- list_staff_accounts(): lists staff accounts with their email and role.
- grant_staff_role(email, role): gives a confirmed account a staff role.
- change_staff_role(user id, role): changes a role, or removes staff access when role is none.
- guard_staff_change(): blocks a super admin from demoting themselves and blocks removing the last super admin.
- is_admin() now also accepts super_admin.

## 5. Security changes
- Anonymous visitors lose UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER on every public table. They keep only the reads and form submissions the public site uses (messages, event registrations, public content).
- Anonymous visitors can no longer read or write the profiles table.
- Signed-in users lose TRUNCATE, REFERENCES and TRIGGER everywhere, and INSERT, UPDATE and DELETE on profiles. Staff still write content through row level security policies.

## 6. Notes
- These functions run as the database owner. Each one checks auth.uid() before doing anything.
- Revocations use the same RLS-gated access the app already uses, so existing screens keep working.
*/

ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_role_check CHECK (role IN ('super_admin', 'admin', 'editor'));
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS display_name text;

ALTER TABLE public.admin_emails DROP CONSTRAINT IF EXISTS admin_emails_role_check;
ALTER TABLE public.admin_emails ADD CONSTRAINT admin_emails_role_check CHECK (role IN ('super_admin', 'admin', 'editor'));
UPDATE public.admin_emails SET role = 'super_admin' WHERE lower(email) = 'ahraouziad6@gmail.com';

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin'))
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND role = 'super_admin')
$$;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

CREATE TABLE IF NOT EXISTS public.system_setup (
  key text PRIMARY KEY,
  completed_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.system_setup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_setup FROM anon, authenticated;
GRANT ALL ON public.system_setup TO service_role;

CREATE OR REPLACE FUNCTION public.list_staff_accounts()
RETURNS TABLE (user_id uuid, email text, display_name text, role text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT au.user_id, u.email::text, au.display_name, au.role, au.created_at
    FROM public.admin_users au
    JOIN auth.users u ON u.id = au.user_id
    ORDER BY au.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_staff_change(p_target uuid, p_new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_target = auth.uid() AND p_new_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'SELF_DEMOTION' USING ERRCODE = '42501';
  END IF;
  IF p_new_role IS DISTINCT FROM 'super_admin'
     AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_target AND role = 'super_admin')
     AND NOT EXISTS (SELECT 1 FROM public.admin_users WHERE role = 'super_admin' AND user_id <> p_target) THEN
    RAISE EXCEPTION 'LAST_SUPER_ADMIN' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_staff_change(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.grant_staff_role(p_email text, p_role text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_target uuid;
  v_confirmed timestamptz;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('super_admin', 'admin', 'editor') THEN
    RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = '22023';
  END IF;
  SELECT id, email_confirmed_at INTO v_target, v_confirmed
  FROM auth.users WHERE lower(email) = lower(trim(p_email));
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_confirmed IS NULL THEN
    RAISE EXCEPTION 'EMAIL_NOT_CONFIRMED' USING ERRCODE = '22023';
  END IF;
  PERFORM public.guard_staff_change(v_target, p_role);
  INSERT INTO public.admin_users (user_id, role) VALUES (v_target, p_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
  VALUES (v_actor, 'staff.role_granted', 'staff_account', v_target::text, jsonb_build_object('role', p_role));
  RETURN v_target;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_staff_role(p_user uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('super_admin', 'admin', 'editor', 'none') THEN
    RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = p_user) THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.guard_staff_change(p_user, p_role);
  IF p_role = 'none' THEN
    DELETE FROM public.admin_users WHERE user_id = p_user;
  ELSE
    UPDATE public.admin_users SET role = p_role WHERE user_id = p_user;
  END IF;
  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, details)
  VALUES (v_actor, 'staff.role_changed', 'staff_account', p_user::text, jsonb_build_object('role', p_role));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_staff_accounts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.grant_staff_role(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.change_staff_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_staff_accounts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_staff_role(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_staff_role(uuid, text) TO authenticated;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE INSERT ON public.news, public.events, public.activities, public.gallery_items, public.places, public.team_members, public.settings, public.site_content FROM anon;
REVOKE ALL ON public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;

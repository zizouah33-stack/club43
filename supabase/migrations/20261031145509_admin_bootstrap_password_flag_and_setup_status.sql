/*
# Admin forced password change flag and public setup status

## 1. Summary
- Adds a flag on administrator accounts so the first login forces a password change.
- Lets a signed-in administrator clear only their own flag. Nothing else on the row is writable.
- Adds a read-only check that tells the setup screen whether the platform administrator already exists.

## 2. Changed objects
- admin_users: new column must_change_password (default false).
- admin_users: authenticated users may update only that column, and only on their own row.
- setup_status(): returns true once the platform administrator setup is complete. Exposes no other data.

## 3. Notes
- No secrets or passwords are stored here.
*/

ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

GRANT UPDATE (must_change_password) ON public.admin_users TO authenticated;

DROP POLICY IF EXISTS "own_admin_flag_update" ON public.admin_users;
CREATE POLICY "own_admin_flag_update" ON public.admin_users
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.setup_status()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.system_setup WHERE key = 'super_admin')
$$;

REVOKE EXECUTE ON FUNCTION public.setup_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.setup_status() TO anon, authenticated;

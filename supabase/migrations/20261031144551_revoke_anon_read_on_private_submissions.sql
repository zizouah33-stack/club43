/*
# Remove anonymous read access to contact messages and event registrations

## 1. Summary
Anonymous visitors had SELECT privilege on the contact messages and event registration tables. Those tables contain names, emails and phone numbers of visitors. The row security policies already restrict reads to signed-in staff, so this only removes a latent exposure.

## 2. Changes
- Revoke SELECT from the anonymous role on messages and event_registrations.
- Anonymous visitors keep INSERT, so the public contact and event forms still work.

## 3. Notes
- No policy grants anonymous reads, so no existing screen depends on this privilege.
*/

REVOKE SELECT ON public.messages FROM anon;
REVOKE SELECT ON public.event_registrations FROM anon;

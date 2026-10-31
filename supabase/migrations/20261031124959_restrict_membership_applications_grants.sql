/*
# Restrict membership_applications grants to staff

1. Changes
- Removes all table privileges from the anon role. Public visitors reach applications only through submit_membership_application().
- Removes TRUNCATE, REFERENCES and TRIGGER from authenticated. Signed-in users keep SELECT, UPDATE and DELETE, which RLS limits to staff.

2. Important notes
- The staff row policies are unchanged.
*/

REVOKE ALL ON membership_applications FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON membership_applications FROM authenticated;

/*
# Add bio column to team_members

1. Modified Tables
- `team_members`: add `bio` text column (nullable) for member biographical description.
2. Security
- No RLS policy changes needed. Existing policies already cover SELECT/INSERT/UPDATE/DELETE.
- The column inherits the table's existing RLS policies automatically.
3. Important Notes
- The column is nullable so existing rows are unaffected.
- No data is deleted or modified.
*/

ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS bio text;

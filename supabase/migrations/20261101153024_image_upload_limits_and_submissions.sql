/*
# Image Upload Limits and Member Submissions System

## 1. Storage Bucket Hardening
Updates existing buckets `team`, `news`, and `places` to enforce the same
image-only rules as `gallery`: only JPG, PNG, and WebP files up to 8 MB.
The `member-photos` bucket (already private) gets the same MIME/size limits.
No new buckets are created.

## 2. New Table: image_submissions
Stores photos submitted by members for review. Each row tracks:
- `id` (uuid PK)
- `user_id` (uuid, defaults to `auth.uid()`, references `auth.users` ON DELETE CASCADE)
- `storage_path` (text, the path in the `member-photos` bucket)
- `media_url` (text, the public/signed URL — stored for convenience)
- `title` (text, required)
- `description` (text, defaults to empty)
- `album` (text, defaults to 'صور متنوعة')
- `event_id` (uuid, nullable, references `events(id)` ON DELETE SET NULL)
- `status` (text: 'pending' | 'approved' | 'rejected', defaults to 'pending')
- `reviewed_by` (uuid, nullable, references `auth.users` ON DELETE SET NULL)
- `reviewed_at` (timestamptz, nullable)
- `created_at` (timestamptz, defaults to now())

## 3. Security — RLS on image_submissions
- `SELECT`: members can see only their own rows; staff (`is_staff()`) can see all.
- `INSERT`: authenticated members can insert only their own rows (user_id = auth.uid()).
- `UPDATE`: staff can update any row (status, reviewed_by, reviewed_at).
  Members cannot update after submission.
- `DELETE`: members can delete their own rows; staff can delete any row.

## 4. Grants
- `SELECT, INSERT, UPDATE, DELETE` on `image_submissions` to `authenticated` only.
  The `anon` role gets nothing — visitors never interact with submissions.

## 5. Indexes
- `image_submissions_user_id_idx` for per-member queries.
- `image_submissions_status_idx` for the admin review queue.
*/

-- 1. Harden existing public image buckets
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[],
    file_size_limit = 8388608
WHERE id IN ('team', 'news', 'places');

-- 2. Harden the private member-photos bucket
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[],
    file_size_limit = 8388608
WHERE id = 'member-photos';

-- 3. Create image_submissions table
CREATE TABLE IF NOT EXISTS image_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  media_url text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  album text NOT NULL DEFAULT 'صور متنوعة',
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE image_submissions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS image_submissions_user_id_idx ON image_submissions(user_id);
CREATE INDEX IF NOT EXISTS image_submissions_status_idx ON image_submissions(status);

-- 4. Grants — authenticated only (no anon access)
GRANT SELECT, INSERT, UPDATE, DELETE ON image_submissions TO authenticated;

-- 5. RLS policies
DROP POLICY IF EXISTS "select_own_submissions_or_staff" ON image_submissions;
CREATE POLICY "select_own_submissions_or_staff"
ON image_submissions FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR is_staff());

DROP POLICY IF EXISTS "insert_own_submissions" ON image_submissions;
CREATE POLICY "insert_own_submissions"
ON image_submissions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "staff_update_submissions" ON image_submissions;
CREATE POLICY "staff_update_submissions"
ON image_submissions FOR UPDATE
TO authenticated
USING (is_staff())
WITH CHECK (is_staff());

DROP POLICY IF EXISTS "delete_own_or_staff_submissions" ON image_submissions;
CREATE POLICY "delete_own_or_staff_submissions"
ON image_submissions FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR is_staff());

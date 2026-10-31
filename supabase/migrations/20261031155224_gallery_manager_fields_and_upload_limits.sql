/*
# Gallery manager: metadata fields and upload limits

1. Modified table `gallery_items`
- `description` (text, default empty): optional caption shown in the lightbox.
- `event_id` (uuid, nullable): optional link to an event; deleting the event keeps the photo.
- `event_date` (date, nullable): date the photo was taken; falls back to upload date when empty.
- `sort_order` (integer, default 0): manual display order; lower numbers appear first.
- `storage_path` (text, nullable): path of the file inside the `gallery` bucket, used to remove the file when the photo is deleted.

2. Modified storage bucket `gallery`
- Accepts only JPEG, PNG and WebP files.
- Maximum file size is 8 MB (8388608 bytes).

3. Security
- No new grants or policies. Existing rules still apply: visitors read published items, staff (admins and editors) manage items and files.

4. Notes
- All statements are idempotent and safe to re-run.
- No existing rows are changed.
*/

ALTER TABLE gallery_items ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE gallery_items ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES events(id) ON DELETE SET NULL;
ALTER TABLE gallery_items ADD COLUMN IF NOT EXISTS event_date date;
ALTER TABLE gallery_items ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE gallery_items ADD COLUMN IF NOT EXISTS storage_path text;

CREATE INDEX IF NOT EXISTS gallery_items_event_id_idx ON gallery_items (event_id);
CREATE INDEX IF NOT EXISTS gallery_items_published_order_idx ON gallery_items (published, sort_order, created_at DESC);

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'],
    file_size_limit = 8388608
WHERE id = 'gallery';

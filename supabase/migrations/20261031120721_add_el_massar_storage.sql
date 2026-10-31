/*
# Add EL-Massar media storage

1. New storage buckets
- `gallery`: public gallery photos and videos.
- `news`: article cover images.
- `team`: team member photos.
- `places`: tourism and heritage images.
- `documents`: bylaws and downloadable club documents.
2. Security
- All buckets are public-read so published website media can load without sign-in.
- Only authenticated club staff may upload, update, or delete objects.
- Object write policies use the existing `public.is_staff()` helper.
3. Important notes
- Existing database records are not changed.
- The public website should store resulting object public URLs in the matching content table.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('gallery', 'gallery', true),
  ('news', 'news', true),
  ('team', 'team', true),
  ('places', 'places', true),
  ('documents', 'documents', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "public_read_el_massar_media" ON storage.objects;
CREATE POLICY "public_read_el_massar_media"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id IN ('gallery', 'news', 'team', 'places', 'documents'));

DROP POLICY IF EXISTS "staff_upload_el_massar_media" ON storage.objects;
CREATE POLICY "staff_upload_el_massar_media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id IN ('gallery', 'news', 'team', 'places', 'documents') AND public.is_staff());

DROP POLICY IF EXISTS "staff_update_el_massar_media" ON storage.objects;
CREATE POLICY "staff_update_el_massar_media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id IN ('gallery', 'news', 'team', 'places', 'documents') AND public.is_staff())
WITH CHECK (bucket_id IN ('gallery', 'news', 'team', 'places', 'documents') AND public.is_staff());

DROP POLICY IF EXISTS "staff_delete_el_massar_media" ON storage.objects;
CREATE POLICY "staff_delete_el_massar_media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id IN ('gallery', 'news', 'team', 'places', 'documents') AND public.is_staff());

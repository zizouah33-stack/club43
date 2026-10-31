/*
# Editable site text (site_content)

1. New table
- `site_content`: one row per editable piece of text on public pages.
  - `key` (text, primary key), e.g. `home.subtitle` or `domain.tourism.title`.
  - `value` (text, not null): the Arabic text shown on the site.
  - `updated_at` (timestamptz) and `updated_by` (uuid, defaults to the signed-in user).
2. Seeded rows
- Home hero, the four domain cards, the call-to-action block, and the Activities, Events and Guide page headings.
3. Security
- RLS enabled.
- Anyone (visitors and signed-in users) can read the text, because it is public website content.
- Only staff (checked with is_staff()) can insert, update or delete rows.
*/

CREATE TABLE IF NOT EXISTS site_content (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON site_content TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON site_content TO authenticated;

DROP POLICY IF EXISTS "public_read_site_content" ON site_content;
CREATE POLICY "public_read_site_content" ON site_content FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "staff_insert_site_content" ON site_content;
CREATE POLICY "staff_insert_site_content" ON site_content FOR INSERT
  TO authenticated WITH CHECK (is_staff());

DROP POLICY IF EXISTS "staff_update_site_content" ON site_content;
CREATE POLICY "staff_update_site_content" ON site_content FOR UPDATE
  TO authenticated USING (is_staff()) WITH CHECK (is_staff());

DROP POLICY IF EXISTS "staff_delete_site_content" ON site_content;
CREATE POLICY "staff_delete_site_content" ON site_content FOR DELETE
  TO authenticated USING (is_staff());

INSERT INTO site_content (key, value) VALUES
  ('home.eyebrow', 'مسارٌ نحو أثر أكبر'),
  ('home.title_before', 'نصنع من'),
  ('home.title_highlight', 'الفضول'),
  ('home.title_after', 'طريقاً إلى المستقبل.'),
  ('home.subtitle', 'مسارٌ يجمع بين العلم والتكنولوجيا والسياحة والثقافة، ليمنح شباب شلغوم العيد مساحة يتعلمون فيها، يبدعون، ويتركون أثراً جميلاً.'),
  ('domain.scientific.title', 'المسار العلمي'),
  ('domain.scientific.text', 'نكتشف، نسأل، ونحوّل التجربة إلى معرفة.'),
  ('domain.technology.title', 'المسار التكنولوجي'),
  ('domain.technology.text', 'نبرمج ونبني أدوات تعبر عن أفكارنا.'),
  ('domain.tourism.title', 'المسار السياحي'),
  ('domain.tourism.text', 'نرى المكان بعين جديدة ونحمي ذاكرته.'),
  ('domain.culture.title', 'المسار الثقافي'),
  ('domain.culture.text', 'نقرأ ونحاور ونمنح الخيال مساحة.'),
  ('cta.eyebrow', 'هل أنت مستعد لبداية جديدة؟'),
  ('cta.title', 'انضم إلى المسار الذي يشبهك.'),
  ('activities.eyebrow', 'أنشطتنا'),
  ('activities.title', 'مسارات تفتح الاحتمالات.'),
  ('events.eyebrow', 'الفعاليات'),
  ('events.title', 'موعدنا دائماً مع تجربة جديدة.'),
  ('guide.eyebrow', 'السياحة والتراث'),
  ('guide.title', 'دليل يروي حكاية المكان.')
ON CONFLICT (key) DO NOTHING;

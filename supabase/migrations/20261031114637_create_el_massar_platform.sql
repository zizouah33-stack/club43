/*
# Create the EL-Massar Club content platform

1. New Tables
- `profiles`: authenticated staff profiles and roles (admin/editor).
- `news`, `events`, `activities`, `gallery_items`, `places`, `team_members`: public club content managed by staff.
- `membership_applications`: visitor membership requests and review status.
- `event_registrations`: visitor registrations for published events.
- `messages`: contact form submissions for the staff inbox.
- `settings`: editable site-wide content and links.
2. Security
- Every table has RLS enabled.
- Public visitors can read published content and submit membership, event registration, and contact forms.
- Authenticated admin/editor accounts can manage content; only admins can manage staff profiles and settings.
- All grants are limited to the roles used by the policies.
3. Important notes
- This is a shared public club website, so public content is intentionally readable without sign-in.
- Membership applications, registrations, and messages are insert-only for visitors and private for staff.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor')),
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  excerpt text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'عام',
  image_url text,
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  image_url text,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  domain text NOT NULL CHECK (domain IN ('scientific', 'technology', 'tourism', 'culture')),
  description text NOT NULL DEFAULT '',
  image_url text,
  activity_date date,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gallery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  media_url text NOT NULL,
  media_type text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  album text NOT NULL DEFAULT 'عام',
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  image_url text,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL,
  photo_url text,
  sort_order integer NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS membership_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  birth_date date,
  interests text[] NOT NULL DEFAULT '{}',
  motivation text NOT NULL DEFAULT '',
  guardian_name text,
  guardian_phone text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, email)
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'editor')); $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'); $$;

REVOKE EXECUTE ON FUNCTION public.is_staff() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE news ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE places ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON news, events, activities, gallery_items, places, team_members TO authenticated;
GRANT SELECT, INSERT ON membership_applications, event_registrations, messages TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON membership_applications, event_registrations, messages TO authenticated;
GRANT SELECT ON news, events, activities, gallery_items, places, team_members TO anon, authenticated;
GRANT SELECT ON settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON settings TO authenticated;

DROP POLICY IF EXISTS "public_read_news" ON news;
CREATE POLICY "public_read_news" ON news FOR SELECT TO anon, authenticated USING (published = true OR public.is_staff());
DROP POLICY IF EXISTS "staff_insert_news" ON news;
CREATE POLICY "staff_insert_news" ON news FOR INSERT TO authenticated WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff_update_news" ON news;
CREATE POLICY "staff_update_news" ON news FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff_delete_news" ON news;
CREATE POLICY "staff_delete_news" ON news FOR DELETE TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "public_read_events" ON events;
CREATE POLICY "public_read_events" ON events FOR SELECT TO anon, authenticated USING (published = true OR public.is_staff());
DROP POLICY IF EXISTS "staff_insert_events" ON events;
CREATE POLICY "staff_insert_events" ON events FOR INSERT TO authenticated WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff_update_events" ON events;
CREATE POLICY "staff_update_events" ON events FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff_delete_events" ON events;
CREATE POLICY "staff_delete_events" ON events FOR DELETE TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "public_read_activities" ON activities;
CREATE POLICY "public_read_activities" ON activities FOR SELECT TO anon, authenticated USING (published = true OR public.is_staff());
DROP POLICY IF EXISTS "staff_insert_activities" ON activities;
CREATE POLICY "staff_insert_activities" ON activities FOR INSERT TO authenticated WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff_update_activities" ON activities;
CREATE POLICY "staff_update_activities" ON activities FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff_delete_activities" ON activities;
CREATE POLICY "staff_delete_activities" ON activities FOR DELETE TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "public_read_gallery" ON gallery_items;
CREATE POLICY "public_read_gallery" ON gallery_items FOR SELECT TO anon, authenticated USING (published = true OR public.is_staff());
DROP POLICY IF EXISTS "staff_insert_gallery" ON gallery_items;
CREATE POLICY "staff_insert_gallery" ON gallery_items FOR INSERT TO authenticated WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff_update_gallery" ON gallery_items;
CREATE POLICY "staff_update_gallery" ON gallery_items FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff_delete_gallery" ON gallery_items;
CREATE POLICY "staff_delete_gallery" ON gallery_items FOR DELETE TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "public_read_places" ON places;
CREATE POLICY "public_read_places" ON places FOR SELECT TO anon, authenticated USING (published = true OR public.is_staff());
DROP POLICY IF EXISTS "staff_insert_places" ON places;
CREATE POLICY "staff_insert_places" ON places FOR INSERT TO authenticated WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff_update_places" ON places;
CREATE POLICY "staff_update_places" ON places FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff_delete_places" ON places;
CREATE POLICY "staff_delete_places" ON places FOR DELETE TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "public_read_team" ON team_members;
CREATE POLICY "public_read_team" ON team_members FOR SELECT TO anon, authenticated USING (published = true OR public.is_staff());
DROP POLICY IF EXISTS "staff_insert_team" ON team_members;
CREATE POLICY "staff_insert_team" ON team_members FOR INSERT TO authenticated WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff_update_team" ON team_members;
CREATE POLICY "staff_update_team" ON team_members FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff_delete_team" ON team_members;
CREATE POLICY "staff_delete_team" ON team_members FOR DELETE TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "public_insert_memberships" ON membership_applications;
CREATE POLICY "public_insert_memberships" ON membership_applications FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "staff_read_memberships" ON membership_applications;
CREATE POLICY "staff_read_memberships" ON membership_applications FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "staff_update_memberships" ON membership_applications;
CREATE POLICY "staff_update_memberships" ON membership_applications FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff_delete_memberships" ON membership_applications;
CREATE POLICY "staff_delete_memberships" ON membership_applications FOR DELETE TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "public_insert_registrations" ON event_registrations;
CREATE POLICY "public_insert_registrations" ON event_registrations FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "staff_read_registrations" ON event_registrations;
CREATE POLICY "staff_read_registrations" ON event_registrations FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "staff_update_registrations" ON event_registrations;
CREATE POLICY "staff_update_registrations" ON event_registrations FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff_delete_registrations" ON event_registrations;
CREATE POLICY "staff_delete_registrations" ON event_registrations FOR DELETE TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "public_insert_messages" ON messages;
CREATE POLICY "public_insert_messages" ON messages FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "staff_read_messages" ON messages;
CREATE POLICY "staff_read_messages" ON messages FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "staff_update_messages" ON messages;
CREATE POLICY "staff_update_messages" ON messages FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "staff_delete_messages" ON messages;
CREATE POLICY "staff_delete_messages" ON messages FOR DELETE TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "public_read_settings" ON settings;
CREATE POLICY "public_read_settings" ON settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "staff_insert_settings" ON settings;
CREATE POLICY "staff_insert_settings" ON settings FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "staff_update_settings" ON settings;
CREATE POLICY "staff_update_settings" ON settings FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "staff_delete_settings" ON settings;
CREATE POLICY "staff_delete_settings" ON settings FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "staff_read_profiles" ON profiles;
CREATE POLICY "staff_read_profiles" ON profiles FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "admin_insert_profiles" ON profiles;
CREATE POLICY "admin_insert_profiles" ON profiles FOR INSERT TO authenticated WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "admin_update_profiles" ON profiles;
CREATE POLICY "admin_update_profiles" ON profiles FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "admin_delete_profiles" ON profiles;
CREATE POLICY "admin_delete_profiles" ON profiles FOR DELETE TO authenticated USING (public.is_admin());

INSERT INTO news (title, slug, excerpt, content, category, published, published_at) VALUES
('نحوّل الفضول إلى إنجاز', 'curiosity-to-achievement', 'من الورشات العلمية إلى الرحلات الاستكشافية، نفتح للشباب مساحة ليجربوا ويبدعوا.', 'يواصل نادي المسار بناء تجارب تعليمية وتطوعية تجمع بين المعرفة والممارسة.', 'النادي', true, now() - interval '3 days'),
('أسبوع التكنولوجيا والابتكار', 'technology-innovation-week', 'ورشات عملية في البرمجة والروبوتيك والذكاء الاصطناعي لفائدة الشباب.', 'برنامج مكثف يضع أدوات المستقبل بين أيدي المشاركين.', 'تكنولوجيا', true, now() - interval '10 days'),
('في الطريق إلى تراثنا المحلي', 'local-heritage-path', 'جولة جديدة لاكتشاف الحكايات والمعالم التي تصنع ذاكرتنا.', 'نؤمن أن السياحة تبدأ من معرفة المكان وحماية ذاكرته.', 'سياحة', true, now() - interval '18 days')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO events (title, description, location, starts_at, ends_at, published) VALUES
('ورشة الروبوتيك للمبتدئين', 'تجربة عملية لبناء أول روبوت وفهم أساسيات التحكم.', 'مقر النادي', now() + interval '7 days', now() + interval '7 days 3 hours', true),
('رحلة اكتشاف ومعرفة', 'يوم مفتوح للتعرف على معالم المنطقة وتوثيق قصصها.', 'نقطة الانطلاق: مقر النادي', now() + interval '14 days', now() + interval '14 days 8 hours', true),
('أمسية القراءة والحوار', 'لقاء ثقافي دافئ حول كتاب وتجربة إنسانية ملهمة.', 'فضاء النادي', now() + interval '21 days', now() + interval '21 days 2 hours', true)
ON CONFLICT DO NOTHING;

INSERT INTO activities (title, domain, description, activity_date, published) VALUES
('مختبر الروبوتيك', 'technology', 'نبني ونبرمج ونختبر حلولاً ذكية بأيدينا.', current_date - 5, true),
('نادي البرمجة', 'technology', 'مساحة آمنة لتعلم البرمجة وتحويل الأفكار إلى مشاريع.', current_date - 12, true),
('رحلات استكشافية', 'tourism', 'نكتشف المكان ونوثق الذاكرة ونحافظ على الطبيعة.', current_date - 20, true),
('نادي القراءة', 'culture', 'نقرأ معاً، نحاور، ونمنح الأفكار وقتها لتكبر.', current_date - 28, true),
('تجارب علمية ممتعة', 'scientific', 'أسئلة بسيطة تقود إلى تجارب مدهشة وفهم أعمق.', current_date - 35, true)
ON CONFLICT DO NOTHING;

INSERT INTO places (name, description, latitude, longitude, published) VALUES
('قلب المدينة', 'نقطة تجمع وانطلاق لاكتشاف المنطقة.', 36.1605, 6.1662, true),
('مسار الطبيعة', 'فضاء مفتوح للتأمل والتعلم الميداني.', 36.1850, 6.1950, true),
('ذاكرة المكان', 'محطة تقترحها الخريطة ضمن جولات التراث.', 36.1370, 6.1450, true)
ON CONFLICT DO NOTHING;

INSERT INTO team_members (name, role, sort_order) VALUES
('أهراو زياد', 'رئيس النادي', 1), ('عبد العزيز ياسمين', 'نائب الرئيس', 2), ('مرزوقي محمد خليل', 'الأمين العام', 3), ('مدور محمد عبد الكريم', 'نائب الأمين العام', 4), ('عيساوي صلاح الدين', 'مسؤول العلاقات العامة', 5), ('بوركيوة إسلام', 'رئيس لجنة الإعلام والاتصال', 6), ('روابح صفيان', 'رئيس لجنة النشاطات الثقافية والعلمية', 7), ('وصال سافر', 'مسؤولة الخرجات السياحية', 8), ('إسحاق بومشعل', 'رئيس اللجان', 9)
ON CONFLICT DO NOTHING;

INSERT INTO settings (key, value) VALUES
('social_links', '{"facebook":"#","instagram":"#","youtube":"#","tiktok":"#"}'::jsonb),
('contact', '{"email":"contact@elmassar.club","phone":"+213 000 000 000","address":"شلغوم العيد، ميلة"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

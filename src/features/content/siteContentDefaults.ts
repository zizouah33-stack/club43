export const SITE_CONTENT_DEFAULTS = {
  'home.eyebrow': 'مسارٌ نحو أثر أكبر',
  'home.title_before': 'نصنع من',
  'home.title_highlight': 'الفضول',
  'home.title_after': 'طريقاً إلى المستقبل.',
  'home.subtitle': 'مسارٌ يجمع بين العلم والتكنولوجيا والسياحة والثقافة، ليمنح شباب شلغوم العيد مساحة يتعلمون فيها، يبدعون، ويتركون أثراً جميلاً.',
  'domain.scientific.title': 'المسار العلمي',
  'domain.scientific.text': 'نكتشف، نسأل، ونحوّل التجربة إلى معرفة.',
  'domain.technology.title': 'المسار التكنولوجي',
  'domain.technology.text': 'نبرمج ونبني أدوات تعبر عن أفكارنا.',
  'domain.tourism.title': 'المسار السياحي',
  'domain.tourism.text': 'نرى المكان بعين جديدة ونحمي ذاكرته.',
  'domain.culture.title': 'المسار الثقافي',
  'domain.culture.text': 'نقرأ ونحاور ونمنح الخيال مساحة.',
  'cta.eyebrow': 'هل أنت مستعد لبداية جديدة؟',
  'cta.title': 'انضم إلى المسار الذي يشبهك.',
  'activities.eyebrow': 'أنشطتنا',
  'activities.title': 'مسارات تفتح الاحتمالات.',
  'events.eyebrow': 'الفعاليات',
  'events.title': 'موعدنا دائماً مع تجربة جديدة.',
  'guide.eyebrow': 'السياحة والتراث',
  'guide.title': 'دليل يروي حكاية المكان.',
} as const;

export type SiteContentKey = keyof typeof SITE_CONTENT_DEFAULTS;

export const SITE_CONTENT_GROUPS: Array<{ title: string; keys: SiteContentKey[] }> = [
  { title: 'الصفحة الرئيسية', keys: ['home.eyebrow', 'home.title_before', 'home.title_highlight', 'home.title_after', 'home.subtitle'] },
  { title: 'المسارات الأربعة', keys: ['domain.scientific.title', 'domain.scientific.text', 'domain.technology.title', 'domain.technology.text', 'domain.tourism.title', 'domain.tourism.text', 'domain.culture.title', 'domain.culture.text'] },
  { title: 'دعوة الانضمام', keys: ['cta.eyebrow', 'cta.title'] },
  { title: 'صفحة الأنشطة', keys: ['activities.eyebrow', 'activities.title'] },
  { title: 'صفحة الفعاليات', keys: ['events.eyebrow', 'events.title'] },
  { title: 'صفحة الدليل السياحي', keys: ['guide.eyebrow', 'guide.title'] },
];

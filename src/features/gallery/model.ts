export const GALLERY_CATEGORIES = [
  'فعاليات وأنشطة النادي',
  'ورشات وتكوينات',
  'مسابقات وإنجازات',
  'رحلات وزيارات',
  'أعضاء وفريق النادي',
  'صور متنوعة',
] as const;

export type GalleryCategory = (typeof GALLERY_CATEGORIES)[number];

export const DEFAULT_GALLERY_CATEGORY: GalleryCategory = 'صور متنوعة';

export type GalleryItem = {
  id: string;
  title: string;
  description: string;
  media_url: string;
  storage_path: string | null;
  album: string;
  event_id: string | null;
  event_date: string | null;
  published: boolean;
  sort_order: number;
  created_at: string;
  events: { title: string } | null;
};

export type GalleryEventOption = { id: string; title: string };

export function galleryItemDate(item: Pick<GalleryItem, 'event_date' | 'created_at'>): string {
  return item.event_date ?? item.created_at.slice(0, 10);
}

export function formatGalleryDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' });
}

import { supabase } from '@/lib/supabase';
import type { GalleryEventOption, GalleryItem } from './model';

const ITEM_COLUMNS = 'id, title, description, media_url, storage_path, album, event_id, event_date, published, sort_order, created_at, events(title)';

type GalleryItemRow = Omit<GalleryItem, 'events'> & { events: { title: string } | { title: string }[] | null };

function isGalleryItemRow(row: unknown): row is GalleryItemRow {
  if (!row || typeof row !== 'object') return false;
  const candidate = row as Partial<GalleryItemRow>;
  return typeof candidate.id === 'string' && typeof candidate.title === 'string' && typeof candidate.media_url === 'string';
}

function toGalleryItem(row: GalleryItemRow): GalleryItem {
  const event = Array.isArray(row.events) ? (row.events[0] ?? null) : row.events;
  return { ...row, events: event };
}

export async function fetchGalleryItems(publishedOnly: boolean): Promise<GalleryItem[]> {
  const base = supabase.from('gallery_items').select(ITEM_COLUMNS).order('sort_order', { ascending: true }).order('created_at', { ascending: false });
  const { data, error } = publishedOnly ? await base.eq('published', true) : await base;
  if (error) throw error;
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return rows.filter(isGalleryItemRow).map(toGalleryItem);
}

export async function fetchGalleryEvents(): Promise<GalleryEventOption[]> {
  const { data, error } = await supabase.from('events').select('id, title').order('starts_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as GalleryEventOption[];
}

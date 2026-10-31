import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Eye, EyeOff, ImageOff, Images, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { fetchGalleryEvents, fetchGalleryItems } from '@/features/gallery/galleryApi';
import { GALLERY_CATEGORIES, formatGalleryDate, galleryItemDate, type GalleryEventOption, type GalleryItem } from '@/features/gallery/model';
import GalleryItemDialog from './GalleryItemDialog';
import GalleryUploadDialog from './GalleryUploadDialog';

type Notice = { tone: 'success' | 'error'; text: string };

const ALL = 'all';
const iconButton = 'flex h-9 w-9 items-center justify-center rounded-xl border border-[#29435F] text-[#F5F7FA] transition hover:border-[#238BE6] hover:text-[#238BE6] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#238BE6]/40 disabled:cursor-not-allowed disabled:opacity-40';

export default function GalleryManager() {
  const navigate = useNavigate();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [events, setEvents] = useState<GalleryEventOption[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<GalleryItem | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    try {
      const [rows, eventRows] = await Promise.all([fetchGalleryItems(false), fetchGalleryEvents()]);
      setItems(rows);
      setEvents(eventRows);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter(item => {
      const haystack = `${item.title} ${item.description} ${item.events?.title ?? ''}`.toLowerCase();
      return (category === ALL || item.album === category) && (needle === '' || haystack.includes(needle));
    });
  }, [items, category, query]);

  const filtersActive = category !== ALL || query.trim() !== '';

  const runChange = async (id: string, change: () => PromiseLike<{ error: unknown }>, successText: string, failText: string) => {
    setBusyId(id);
    const { error } = await change();
    setBusyId(null);
    setNotice(error ? { tone: 'error', text: failText } : { tone: 'success', text: successText });
    if (!error) await load();
  };

  const togglePublished = (item: GalleryItem) =>
    runChange(
      item.id,
      () => supabase.from('gallery_items').update({ published: !item.published }).eq('id', item.id),
      item.published ? 'تم إخفاء الصورة من المعرض.' : 'تم نشر الصورة في المعرض.',
      'تعذر تحديث حالة النشر.',
    );

  const setCover = (item: GalleryItem) => {
    const eventId = item.event_id;
    if (!eventId) return;
    runChange(
      item.id,
      () => supabase.from('events').update({ image_url: item.media_url }).eq('id', eventId),
      'تم تعيين الصورة غلافاً للفعالية.',
      'تعذر تعيين صورة الغلاف.',
    );
  };

  const moveItem = async (item: GalleryItem, direction: -1 | 1) => {
    const ordered = [...items];
    const from = ordered.findIndex(row => row.id === item.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ordered.length) return;
    [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
    const changes = ordered.flatMap((row, position) => (row.sort_order === position ? [] : [{ id: row.id, position }]));
    if (changes.length === 0) return;
    setBusyId(item.id);
    const results = await Promise.all(changes.map(change => supabase.from('gallery_items').update({ sort_order: change.position }).eq('id', change.id)));
    setBusyId(null);
    setNotice(results.some(result => result.error) ? { tone: 'error', text: 'تعذر تغيير الترتيب. حاول مرة أخرى.' } : null);
    await load();
  };

  const removeItem = async (item: GalleryItem) => {
    if (!window.confirm(`هل تريد حذف الصورة "${item.title}" نهائياً؟`)) return;
    setBusyId(item.id);
    const { error } = await supabase.from('gallery_items').delete().eq('id', item.id);
    if (error) {
      setBusyId(null);
      setNotice({ tone: 'error', text: 'تعذر حذف الصورة.' });
      return;
    }
    let fileRemoved = true;
    if (item.storage_path) {
      const { error: fileError } = await supabase.storage.from('gallery').remove([item.storage_path]);
      fileRemoved = !fileError;
    }
    setBusyId(null);
    setNotice(fileRemoved ? { tone: 'success', text: 'تم حذف الصورة.' } : { tone: 'error', text: 'تم حذف الصورة من المعرض، لكن تعذر حذف ملفها من التخزين.' });
    await load();
  };

  const handleSaved = (message: string) => {
    setEditing(null);
    setNotice({ tone: 'success', text: message });
    load();
  };

  return (
    <main className="min-h-screen bg-[#071629] pb-16 pt-8 text-[#F5F7FA]">
      <div className="container">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <button type="button" onClick={() => navigate('/admin/dashboard')} className="soft-button mb-4"><ArrowRight size={16} /> العودة إلى اللوحة</button>
            <span className="eyebrow">إدارة المحتوى</span>
            <h1 className="mt-2 text-3xl font-black text-[#F5F7FA]">المعرض والصور</h1>
            <p className="mt-2 text-sm text-[#A9B8CA]">رفع الصور وتنظيمها ونشرها أو إخفاؤها.</p>
          </div>
          <button type="button" onClick={() => setUploadOpen(true)} className="blue-button self-start sm:self-auto"><Plus size={16} /> رفع صور</button>
        </div>

        <div className="mt-8 grid gap-4 rounded-3xl border border-[#29435F] bg-[#0B1D35] p-4 sm:grid-cols-[1fr_auto] sm:p-5">
          <div className="relative">
            <Search size={18} aria-hidden="true" className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-[#A9B8CA]" />
            <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث بالعنوان أو الوصف أو الفعالية..." aria-label="بحث في المعرض" className="input ps-11" />
          </div>
          <select value={category} onChange={event => setCategory(event.target.value)} aria-label="تصفية حسب التصنيف" className="input sm:w-64">
            <option value={ALL}>كل التصنيفات</option>
            {GALLERY_CATEGORIES.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        {notice && (
          <p role="status" className={`mt-5 flex items-center justify-between gap-4 rounded-2xl p-4 text-sm font-bold ${notice.tone === 'success' ? 'bg-[#2E9E5B]/15 text-[#86EFAC]' : 'bg-[#E5484D]/15 text-[#FCA5A5]'}`}>
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-xs underline">إخفاء</button>
          </p>
        )}

        <div className="mt-8">
          {status === 'loading' && (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
              {[1, 2, 3].map(key => <div key={key} className="h-80 animate-pulse rounded-3xl bg-[#112A47]" />)}
            </div>
          )}

          {status === 'error' && (
            <div className="rounded-3xl border border-[#E5484D]/40 bg-[#112A47] px-6 py-14 text-center">
              <p className="font-bold">تعذر تحميل المعرض. حاول مرة أخرى.</p>
              <button type="button" onClick={() => { setStatus('loading'); load(); }} className="blue-button mt-5">إعادة المحاولة</button>
            </div>
          )}

          {status === 'ready' && items.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-[#29435F] bg-[#0B1D35] px-6 py-16 text-center">
              <Images size={40} aria-hidden="true" className="text-[#A9B8CA]" />
              <p className="font-black">لا توجد صور في المعرض بعد</p>
              <p className="text-sm text-[#A9B8CA]">ارفع أول صورة لتظهر للزوار بعد نشرها.</p>
            </div>
          )}

          {status === 'ready' && items.length > 0 && filtered.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-[#29435F] bg-[#0B1D35] px-6 py-16 text-center">
              <ImageOff size={36} aria-hidden="true" className="text-[#A9B8CA]" />
              <p className="font-black">لا توجد صور تطابق البحث.</p>
              <button type="button" onClick={() => { setCategory(ALL); setQuery(''); }} className="soft-button">مسح عوامل التصفية</button>
            </div>
          )}

          {status === 'ready' && filtered.length > 0 && (
            <>
              <p className="mb-4 text-sm text-[#A9B8CA]">{filtered.length} من {items.length} صورة{filtersActive ? ' (مع التصفية)' : ''}</p>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map(item => {
                  const index = items.findIndex(row => row.id === item.id);
                  const busy = busyId === item.id;
                  return (
                    <article key={item.id} className="overflow-hidden rounded-3xl border border-[#29435F] bg-[#112A47]">
                      <div className="relative aspect-[4/3] bg-[#0B1D35]">
                        <img src={item.media_url} alt={item.title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                        <span className={`absolute start-3 top-3 rounded-full px-3 py-1 text-xs font-black ${item.published ? 'bg-[#2E9E5B] text-white' : 'bg-[#D9AC45] text-[#071629]'}`}>
                          {item.published ? 'منشورة' : 'مخفية'}
                        </span>
                      </div>
                      <div className="p-4">
                        <h3 className="truncate font-black text-[#F5F7FA]">{item.title}</h3>
                        <p className="mt-1 text-xs text-[#A9B8CA]">{item.album} · {formatGalleryDate(galleryItemDate(item))}</p>
                        {item.events?.title && <p className="mt-1 truncate text-xs text-[#A9B8CA]">الفعالية: {item.events.title}</p>}
                        <div className="mt-4 flex flex-wrap items-center gap-2" aria-busy={busy}>
                          <button type="button" onClick={() => setEditing(item)} disabled={busy} aria-label="تعديل" title="تعديل" className={iconButton}><Pencil size={15} /></button>
                          <button type="button" onClick={() => togglePublished(item)} disabled={busy} aria-label={item.published ? 'إخفاء' : 'نشر'} title={item.published ? 'إخفاء' : 'نشر'} className={iconButton}>
                            {item.published ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                          <button type="button" onClick={() => moveItem(item, -1)} disabled={busy || filtersActive || index <= 0} aria-label="تقديم الصورة" title={filtersActive ? 'أزل التصفية لتغيير الترتيب' : 'تقديم'} className={iconButton}><ArrowUp size={15} /></button>
                          <button type="button" onClick={() => moveItem(item, 1)} disabled={busy || filtersActive || index >= items.length - 1} aria-label="تأخير الصورة" title={filtersActive ? 'أزل التصفية لتغيير الترتيب' : 'تأخير'} className={iconButton}><ArrowDown size={15} /></button>
                          {item.event_id && <button type="button" onClick={() => setCover(item)} disabled={busy} aria-label="تعيين غلافاً للفعالية" title="تعيين غلافاً للفعالية" className={iconButton}><Star size={15} /></button>}
                          <button type="button" onClick={() => removeItem(item)} disabled={busy} aria-label="حذف" title="حذف" className={`${iconButton} text-[#F87171] hover:text-[#F87171]`}><Trash2 size={15} /></button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {uploadOpen && (
        <GalleryUploadDialog events={events} onClose={() => setUploadOpen(false)} onUploaded={load} />
      )}
      {editing && (
        <GalleryItemDialog item={editing} events={events} onClose={() => setEditing(null)} onSaved={handleSaved} />
      )}
    </main>
  );
}

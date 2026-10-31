import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarRange, ImageOff, RefreshCw, Search } from 'lucide-react';
import { fetchGalleryItems } from './galleryApi';
import GalleryLightbox from './GalleryLightbox';
import { GALLERY_CATEGORIES, galleryItemDate, formatGalleryDate, type GalleryItem } from './model';

const ALL = 'all';

export default function GalleryPage() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    fetchGalleryItems(true)
      .then(rows => {
        if (!active) return;
        setItems(rows);
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const closeLightbox = useCallback(() => setOpenIndex(null), []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter(item => {
      const date = galleryItemDate(item);
      const haystack = `${item.title} ${item.description} ${item.events?.title ?? ''}`.toLowerCase();
      return (category === ALL || item.album === category)
        && (needle === '' || haystack.includes(needle))
        && (from === '' || date >= from)
        && (to === '' || date <= to);
    });
  }, [items, category, query, from, to]);

  const filtersActive = category !== ALL || query.trim() !== '' || from !== '' || to !== '';
  const resetFilters = () => {
    setCategory(ALL);
    setQuery('');
    setFrom('');
    setTo('');
  };
  const retry = () => {
    setStatus('loading');
    setReloadKey(key => key + 1);
  };

  return (
    <div className="mt-10">
      <div className="rounded-3xl border border-[#29435F] bg-[#0B1D35] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search size={18} aria-hidden="true" className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-[#A9B8CA]" />
            <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث في عناوين الصور ووصفها..." aria-label="بحث في الصور" className="input ps-11" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:w-auto">
            <label className="flex items-center gap-2 rounded-2xl border border-[#29435F] bg-[#183653] px-3 text-xs font-bold text-[#A9B8CA] focus-within:border-[#238BE6]">
              <CalendarRange size={16} aria-hidden="true" className="shrink-0" />
              <span className="shrink-0">من</span>
              <input type="date" value={from} onChange={event => setFrom(event.target.value)} aria-label="من تاريخ" className="w-full bg-transparent py-3 text-sm text-[#F5F7FA] outline-none" />
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-[#29435F] bg-[#183653] px-3 text-xs font-bold text-[#A9B8CA] focus-within:border-[#238BE6]">
              <CalendarRange size={16} aria-hidden="true" className="shrink-0" />
              <span className="shrink-0">إلى</span>
              <input type="date" value={to} onChange={event => setTo(event.target.value)} aria-label="إلى تاريخ" className="w-full bg-transparent py-3 text-sm text-[#F5F7FA] outline-none" />
            </label>
          </div>
        </div>

        <div role="group" aria-label="تصفية حسب التصنيف" className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {[ALL, ...GALLERY_CATEGORIES].map(item => {
            const label = item === ALL ? 'الكل' : item;
            const selected = category === item;
            return (
              <button key={item} type="button" aria-pressed={selected} onClick={() => setCategory(item)} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#238BE6]/40 ${selected ? 'border-[#D9AC45] bg-[#D9AC45] text-[#071629]' : 'border-[#29435F] bg-[#112A47] text-[#F5F7FA] hover:border-[#238BE6]'}`}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {status === 'ready' && items.length > 0 && (
        <div className="mt-6 flex items-center justify-between gap-4 text-sm text-[#A9B8CA]">
          <span>{filtered.length} صورة</span>
          {filtersActive && <button type="button" onClick={resetFilters} className="font-bold text-[#D9AC45] hover:underline">مسح عوامل التصفية</button>}
        </div>
      )}

      <div className="mt-6">
        {status === 'loading' && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {[1, 2, 3, 4, 5, 6].map(key => <div key={key} className="aspect-[4/3] animate-pulse rounded-3xl bg-[#112A47]" />)}
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-[#E5484D]/40 bg-[#112A47] px-6 py-14 text-center">
            <p className="font-bold text-[#F5F7FA]">تعذر تحميل المعرض. تحقق من الاتصال وحاول مرة أخرى.</p>
            <button type="button" onClick={retry} className="blue-button"><RefreshCw size={16} /> إعادة المحاولة</button>
          </div>
        )}

        {status === 'ready' && items.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-[#29435F] bg-[#0B1D35] px-6 py-16 text-center">
            <ImageOff size={40} aria-hidden="true" className="text-[#A9B8CA]" />
            <p className="font-black text-[#F5F7FA]">لا توجد صور منشورة بعد</p>
            <p className="text-sm text-[#A9B8CA]">ستظهر صور أنشطة النادي هنا فور نشرها.</p>
          </div>
        )}

        {status === 'ready' && items.length > 0 && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-[#29435F] bg-[#0B1D35] px-6 py-16 text-center">
            <p className="font-black text-[#F5F7FA]">لا توجد صور تطابق البحث أو التصفية.</p>
            <button type="button" onClick={resetFilters} className="soft-button">مسح عوامل التصفية</button>
          </div>
        )}

        {status === 'ready' && filtered.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item, index) => (
              <button key={item.id} type="button" onClick={() => setOpenIndex(index)} aria-label={`عرض ${item.title}`} className="group relative aspect-[4/3] overflow-hidden rounded-3xl border border-[#29435F] bg-[#112A47] text-start transition hover:-translate-y-1 hover:border-[#238BE6]/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#238BE6]/40">
                <img src={item.media_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#071629] via-[#071629]/70 to-transparent p-5 pt-16">
                  <span className="text-xs font-bold text-[#D9AC45]">{item.album}</span>
                  <h3 className="mt-1 line-clamp-2 font-black text-[#F5F7FA]">{item.title}</h3>
                  <p className="mt-1 text-xs text-[#A9B8CA]">{formatGalleryDate(galleryItemDate(item))}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {openIndex !== null && filtered[openIndex] && (
        <GalleryLightbox items={filtered} index={openIndex} onNavigate={setOpenIndex} onClose={closeLightbox} />
      )}
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { formatGalleryDate, galleryItemDate, type GalleryItem } from './model';

type GalleryLightboxProps = {
  items: GalleryItem[];
  index: number;
  onNavigate: (index: number) => void;
  onClose: () => void;
};

export default function GalleryLightbox({ items, index, onNavigate, onClose }: GalleryLightboxProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const total = items.length;
  const item = items[index];

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') onNavigate((index + 1) % total);
      if (event.key === 'ArrowRight') onNavigate((index - 1 + total) % total);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, total, onClose, onNavigate]);

  if (!item) return null;

  const eventTitle = item.events?.title;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-[#071629]/95 backdrop-blur-md" role="dialog" aria-modal="true" aria-label={item.title}>
      <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-8">
        <span className="text-sm font-bold text-[#A9B8CA]" dir="ltr">{index + 1} / {total}</span>
        <button ref={closeRef} onClick={onClose} aria-label="إغلاق" className="flex h-11 w-11 items-center justify-center rounded-full border border-[#29435F] bg-[#112A47] text-[#F5F7FA] transition hover:border-[#238BE6] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#238BE6]/40">
          <X size={20} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 sm:px-20">
        {total > 1 && (
          <button onClick={() => onNavigate((index - 1 + total) % total)} aria-label="الصورة السابقة" className="absolute start-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#29435F] bg-[#112A47]/90 text-[#F5F7FA] transition hover:border-[#D9AC45] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#238BE6]/40 sm:start-6">
            <ChevronRight size={22} />
          </button>
        )}
        <img key={item.id} src={item.media_url} alt={item.title} className="max-h-[60vh] max-w-full rounded-2xl object-contain shadow-2xl sm:max-h-[66vh]" />
        {total > 1 && (
          <button onClick={() => onNavigate((index + 1) % total)} aria-label="الصورة التالية" className="absolute end-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#29435F] bg-[#112A47]/90 text-[#F5F7FA] transition hover:border-[#D9AC45] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#238BE6]/40 sm:end-6">
            <ChevronLeft size={22} />
          </button>
        )}
      </div>

      <div className="border-t border-[#29435F] bg-[#0B1D35] px-5 py-5 sm:px-8">
        <span className="inline-flex rounded-full bg-[#D9AC45]/15 px-3 py-1 text-xs font-bold text-[#D9AC45]">{item.album}</span>
        <h2 className="mt-3 text-xl font-black text-[#F5F7FA] sm:text-2xl">{item.title}</h2>
        {item.description && <p className="mt-2 max-w-3xl text-sm leading-7 text-[#A9B8CA]">{item.description}</p>}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#A9B8CA]">
          <span>التاريخ: {formatGalleryDate(galleryItemDate(item))}</span>
          {eventTitle && <span>الفعالية: {eventTitle}</span>}
        </div>
      </div>
    </div>
  );
}

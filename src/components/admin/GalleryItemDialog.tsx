import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import GalleryFields, { type GalleryMeta } from '@/features/gallery/GalleryFields';
import type { GalleryEventOption, GalleryItem } from '@/features/gallery/model';

type GalleryItemDialogProps = {
  item: GalleryItem;
  events: GalleryEventOption[];
  onClose: () => void;
  onSaved: (message: string) => void;
};

export default function GalleryItemDialog({ item, events, onClose, onSaved }: GalleryItemDialogProps) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [published, setPublished] = useState(item.published);
  const [meta, setMeta] = useState<GalleryMeta>({ category: item.album, eventId: item.event_id ?? '', eventDate: item.event_date ?? '' });
  const [titleError, setTitleError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setTitleError('أدخل عنواناً للصورة.');
      return;
    }
    setTitleError('');
    setSaveError('');
    setSaving(true);
    const { error } = await supabase
      .from('gallery_items')
      .update({
        title: cleanTitle,
        description: description.trim(),
        album: meta.category,
        event_id: meta.eventId || null,
        event_date: meta.eventDate || null,
        published,
      })
      .eq('id', item.id);
    setSaving(false);
    if (error) {
      setSaveError('تعذر حفظ التعديلات. حاول مرة أخرى.');
      return;
    }
    onSaved('تم حفظ تعديلات الصورة.');
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#071629]/80 p-4 backdrop-blur-sm">
      <form onSubmit={save} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-[#29435F] bg-[#0B1D35] p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="eyebrow">تعديل الصورة</span>
            <h2 className="mt-2 text-2xl font-black text-[#F5F7FA]">بيانات الصورة</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="icon-button"><X size={18} /></button>
        </div>

        <div className="mt-6 grid gap-5">
          <div className="aspect-video overflow-hidden rounded-2xl border border-[#29435F] bg-[#112A47]">
            <img src={item.media_url} alt="" className="h-full w-full object-contain" />
          </div>

          <div>
            <label className="label" htmlFor="gallery-title">العنوان</label>
            <input id="gallery-title" value={title} onChange={event => setTitle(event.target.value)} aria-invalid={titleError !== ''} className="input mt-2" />
            {titleError && <p className="mt-2 text-sm font-bold text-[#F87171]">{titleError}</p>}
          </div>

          <div>
            <label className="label" htmlFor="gallery-description">الوصف</label>
            <textarea id="gallery-description" rows={3} value={description} onChange={event => setDescription(event.target.value)} className="input mt-2" />
          </div>

          <GalleryFields value={meta} events={events} onChange={setMeta} disabled={saving} />

          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[#29435F] bg-[#112A47] p-4 text-sm font-bold text-[#F5F7FA]">
            <input type="checkbox" checked={published} onChange={event => setPublished(event.target.checked)} className="h-5 w-5 accent-[#D9AC45]" />
            نشر الصورة في المعرض العام
          </label>
        </div>

        {saveError && <p className="mt-5 rounded-2xl bg-[#E5484D]/15 p-4 text-sm font-bold text-[#FCA5A5]">{saveError}</p>}

        <div className="mt-7 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={saving} className="soft-button">إلغاء</button>
          <button type="submit" disabled={saving} className="blue-button">
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
          </button>
        </div>
      </form>
    </div>
  );
}

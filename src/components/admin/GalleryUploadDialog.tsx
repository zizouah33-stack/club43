import { useMemo, useState } from 'react';
import { CheckCircle2, ImagePlus, Loader2, Trash2, TriangleAlert, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import GalleryFields, { type GalleryMeta } from '@/features/gallery/GalleryFields';
import { buildGalleryPath, galleryPublicUrl, optimizeGalleryImage, uploadGalleryObject, validateGalleryFile } from '@/features/gallery/galleryFiles';
import { DEFAULT_GALLERY_CATEGORY, type GalleryEventOption } from '@/features/gallery/model';

type DraftStatus = 'ready' | 'uploading' | 'done' | 'failed';

type Draft = {
  id: string;
  file: File;
  preview: string;
  title: string;
  description: string;
  status: DraftStatus;
  progress: number;
  error: string;
};

type GalleryUploadDialogProps = {
  events: GalleryEventOption[];
  onClose: () => void;
  onUploaded: () => void;
};

const today = () => new Date().toLocaleDateString('en-CA');

export default function GalleryUploadDialog({ events, onClose, onUploaded }: GalleryUploadDialogProps) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [meta, setMeta] = useState<GalleryMeta>({ category: DEFAULT_GALLERY_CATEGORY, eventId: '', eventDate: today() });
  const [published, setPublished] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const overallProgress = useMemo(() => {
    if (drafts.length === 0) return 0;
    return Math.round(drafts.reduce((sum, draft) => sum + (draft.status === 'done' ? 100 : draft.progress), 0) / drafts.length);
  }, [drafts]);

  const pendingCount = drafts.filter(draft => draft.status !== 'done').length;

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const accepted: Draft[] = [];
    const problems: string[] = [];
    Array.from(files).forEach(file => {
      const problem = validateGalleryFile(file);
      if (problem) {
        problems.push(`${file.name}: ${problem}`);
        return;
      }
      accepted.push({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        title: file.name.replace(/\.[^.]+$/, ''),
        description: '',
        status: 'ready',
        progress: 0,
        error: '',
      });
    });
    setDrafts(previous => [...previous, ...accepted]);
    setNotice(problems.length > 0 ? { tone: 'error', text: problems.join(' ') } : null);
  };

  const updateDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts(previous => previous.map(draft => (draft.id === id ? { ...draft, ...patch } : draft)));
  };

  const removeDraft = (draft: Draft) => {
    URL.revokeObjectURL(draft.preview);
    setDrafts(previous => previous.filter(item => item.id !== draft.id));
  };

  const close = () => {
    drafts.forEach(draft => URL.revokeObjectURL(draft.preview));
    onClose();
  };

  const uploadAll = async () => {
    if (drafts.some(draft => draft.status !== 'done' && draft.title.trim() === '')) {
      setNotice({ tone: 'error', text: 'أضف عنواناً لكل صورة قبل الرفع.' });
      return;
    }
    setUploading(true);
    setNotice(null);
    let failures = 0;
    const queue = drafts.filter(draft => draft.status !== 'done');

    for (const draft of queue) {
      updateDraft(draft.id, { status: 'uploading', progress: 0, error: '' });
      try {
        const body = await optimizeGalleryImage(draft.file);
        const path = buildGalleryPath(body.type);
        await uploadGalleryObject(path, body, ratio => updateDraft(draft.id, { progress: Math.round(ratio * 100) }));
        const { error } = await supabase.from('gallery_items').insert({
          title: draft.title.trim(),
          description: draft.description.trim(),
          media_url: galleryPublicUrl(path),
          storage_path: path,
          media_type: 'image',
          album: meta.category,
          event_id: meta.eventId || null,
          event_date: meta.eventDate || null,
          published,
        });
        if (error) {
          await supabase.storage.from('gallery').remove([path]);
          throw new Error('insert failed');
        }
        updateDraft(draft.id, { status: 'done', progress: 100 });
      } catch {
        failures += 1;
        updateDraft(draft.id, { status: 'failed', error: 'تعذر رفع هذه الصورة. تحقق من الاتصال وحاول مرة أخرى.' });
      }
    }

    setUploading(false);
    onUploaded();
    if (failures === 0) {
      setNotice({ tone: 'success', text: `تم رفع ${queue.length} ${queue.length === 1 ? 'صورة' : 'صور'} بنجاح.` });
    } else {
      setNotice({ tone: 'error', text: `تم رفع ${queue.length - failures} من ${queue.length} صور. راجع الصور المتعثرة وأعد المحاولة.` });
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#071629]/80 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label="رفع صور جديدة" className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-[2rem] border border-[#29435F] bg-[#0B1D35] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#29435F] p-6 sm:p-8">
          <div>
            <span className="eyebrow">رفع الصور</span>
            <h2 className="mt-2 text-2xl font-black text-[#F5F7FA]">إضافة صور إلى المعرض</h2>
          </div>
          <button type="button" onClick={close} disabled={uploading} aria-label="إغلاق" className="icon-button disabled:opacity-40"><X size={18} /></button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6 sm:p-8">
          <label className={`flex cursor-pointer flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-[#29435F] bg-[#112A47] p-8 text-center transition hover:border-[#238BE6] ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
            <ImagePlus size={36} aria-hidden="true" className="text-[#238BE6]" />
            <span className="font-black text-[#F5F7FA]">اختر صورة أو أكثر</span>
            <span className="text-xs text-[#A9B8CA]">JPG أو PNG أو WebP، حتى 8 ميغابايت لكل صورة</span>
            <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={event => { addFiles(event.target.files); event.target.value = ''; }} />
          </label>

          {notice && (
            <p className={`rounded-2xl p-4 text-sm font-bold ${notice.tone === 'success' ? 'bg-[#2E9E5B]/15 text-[#86EFAC]' : 'bg-[#E5484D]/15 text-[#FCA5A5]'}`} role="status">{notice.text}</p>
          )}

          {drafts.length > 0 && (
            <div className="space-y-4">
              {drafts.map(draft => (
                <div key={draft.id} className="flex gap-4 rounded-2xl border border-[#29435F] bg-[#112A47] p-4">
                  <img src={draft.preview} alt="" className="h-24 w-24 shrink-0 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1 space-y-3">
                    <input value={draft.title} onChange={event => updateDraft(draft.id, { title: event.target.value })} disabled={uploading || draft.status === 'done'} aria-label="عنوان الصورة" placeholder="عنوان الصورة" className="input py-2.5" />
                    <textarea value={draft.description} onChange={event => updateDraft(draft.id, { description: event.target.value })} disabled={uploading || draft.status === 'done'} aria-label="وصف الصورة" placeholder="وصف مختصر (اختياري)" rows={2} className="input py-2.5" />
                    <DraftStatusLine draft={draft} />
                  </div>
                  <button type="button" onClick={() => removeDraft(draft)} disabled={uploading} aria-label="إزالة الصورة" className="icon-button h-10 w-10 shrink-0 text-[#F87171] disabled:opacity-40"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-5 border-t border-[#29435F] pt-6">
            <GalleryFields value={meta} events={events} onChange={setMeta} disabled={uploading} />
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[#29435F] bg-[#112A47] p-4 text-sm font-bold text-[#F5F7FA]">
              <input type="checkbox" checked={published} disabled={uploading} onChange={event => setPublished(event.target.checked)} className="h-5 w-5 accent-[#D9AC45]" />
              نشر الصور فور رفعها (إلغاء التحديد يُبقيها مخفية)
            </label>
          </div>
        </div>

        <div className="border-t border-[#29435F] p-6 sm:p-8">
          {uploading && (
            <div className="mb-4">
              <div className="mb-2 flex justify-between text-xs font-bold text-[#A9B8CA]"><span>التقدم الإجمالي</span><span dir="ltr">{overallProgress}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-[#183653]" role="progressbar" aria-valuenow={overallProgress} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-[#D9AC45] transition-all duration-300" style={{ width: `${overallProgress}%` }} />
              </div>
            </div>
          )}
          <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
            <button type="button" onClick={close} disabled={uploading} className="soft-button">{uploading ? 'انتظر انتهاء الرفع' : 'إغلاق'}</button>
            <button type="button" onClick={uploadAll} disabled={uploading || pendingCount === 0} className="blue-button disabled:cursor-not-allowed disabled:opacity-50">
              {uploading ? <Loader2 size={16} className="animate-spin" /> : null}
              {uploading ? 'جارٍ الرفع...' : `رفع ${pendingCount || ''} ${pendingCount === 1 ? 'صورة' : 'صور'}`.trim()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DraftStatusLine({ draft }: { draft: Draft }) {
  if (draft.status === 'done') {
    return <p className="flex items-center gap-2 text-xs font-bold text-[#86EFAC]"><CheckCircle2 size={14} /> تم الرفع</p>;
  }
  if (draft.status === 'failed') {
    return <p className="flex items-center gap-2 text-xs font-bold text-[#FCA5A5]"><TriangleAlert size={14} /> {draft.error}</p>;
  }
  if (draft.status === 'uploading') {
    return (
      <div>
        <div className="mb-1 text-xs font-bold text-[#A9B8CA]" dir="ltr">{draft.progress}%</div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#183653]"><div className="h-full rounded-full bg-[#238BE6] transition-all duration-300" style={{ width: `${draft.progress}%` }} /></div>
      </div>
    );
  }
  return <p className="text-xs text-[#A9B8CA]">في انتظار الرفع</p>;
}

import { useCallback, useEffect, useState } from 'react';
import { Clock, ImagePlus, Loader2, Send, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { IMAGE_ACCEPT, removeFile, uploadImage, validateImageFile } from '@/lib/imageUpload';
import { GALLERY_CATEGORIES, DEFAULT_GALLERY_CATEGORY, formatGalleryDate, galleryItemDate } from '@/features/gallery/model';
import type { GalleryEventOption } from '@/features/gallery/model';

type Submission = {
  id: string;
  title: string;
  description: string;
  album: string;
  storage_path: string;
  media_url: string;
  status: string;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = { pending: 'قيد المراجعة', approved: 'مقبولة', rejected: 'مرفوضة' };
const STATUS_COLORS: Record<string, string> = { pending: 'bg-[#D9AC45] text-[#071629]', approved: 'bg-[#2E9E5B] text-white', rejected: 'bg-[#E5484D] text-white' };

async function signedUrl(path: string): Promise<string> {
  const { data } = await supabase.storage.from('member-photos').createSignedUrl(path, 3600);
  return data?.signedUrl ?? '';
}

export default function MemberPhotoSubmissions() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<GalleryEventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [album, setAlbum] = useState<string>(DEFAULT_GALLERY_CATEGORY);
  const [eventId, setEventId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [subsResult, eventsResult] = await Promise.all([
      supabase.from('image_submissions').select('id, title, description, album, storage_path, media_url, status, created_at').order('created_at', { ascending: false }),
      supabase.from('events').select('id, title').order('starts_at', { ascending: false }).eq('published', true),
    ]);
    const rows = (subsResult.data as Submission[] | null) ?? [];
    setSubmissions(rows);
    setEvents((eventsResult.data as GalleryEventOption[] | null) ?? []);
    const urlMap: Record<string, string> = {};
    await Promise.all(rows.map(async row => { urlMap[row.id] = await signedUrl(row.storage_path); }));
    setImageUrls(urlMap);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pickFile = (selected: File | null) => {
    if (!selected) return;
    setError('');
    const problem = validateImageFile(selected);
    if (problem) { setError(problem); return; }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  };

  const submit = async () => {
    if (!file) { setError('اختر صورة أولاً.'); return; }
    if (!title.trim()) { setError('أضف عنواناً للصورة.'); return; }
    setUploading(true);
    setError('');
    setNotice(null);
    setProgress(0);
    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user?.id;
      if (!userId) throw new Error('الجلسة منتهية.');
      const { path, url } = await uploadImage(file, { bucket: 'member-photos', folder: userId, onProgress: ratio => setProgress(Math.round(ratio * 100)) });
      const { error: insertError } = await supabase.from('image_submissions').insert({
        title: title.trim(), description: description.trim(), album, event_id: eventId || null,
        storage_path: path, media_url: url, status: 'pending',
      });
      if (insertError) { await removeFile('member-photos', path); throw new Error('تعذر حفظ الطلب.'); }
      setNotice({ tone: 'success', text: 'تم إرسال الصورة للمراجعة. ستظهر في المعرض بعد قبولها.' });
      setTitle(''); setDescription(''); setFile(null); setPreview(''); setEventId(''); setProgress(0);
      await load();
    } catch {
      setNotice({ tone: 'error', text: 'تعذر إرسال الصورة. تحقق من الاتصال وحاول مرة أخرى.' });
    } finally { setUploading(false); setProgress(0); }
  };

  const deleteSubmission = async (sub: Submission) => {
    if (!window.confirm(`حذف الصورة "${sub.title}"؟`)) return;
    const { error: deleteError } = await supabase.from('image_submissions').delete().eq('id', sub.id);
    if (deleteError) { setNotice({ tone: 'error', text: 'تعذر حذف الطلب.' }); return; }
    await removeFile('member-photos', sub.storage_path);
    setNotice({ tone: 'success', text: 'تم حذف الطلب.' });
    await load();
  };

  const resetForm = () => { if (preview) URL.revokeObjectURL(preview); setFile(null); setPreview(''); setError(''); };

  return (
    <section className="rounded-[1.5rem] border border-[#29435F] bg-[#0B1D35] p-6 sm:p-8">
      <h2 className="text-lg font-black text-[#F5F7FA]">مشاركة الصور</h2>
      <p className="mt-2 text-sm text-[#A9B8CA]">شارك صورك من أنشطة النادي وفعالياته. تُراجع الإدارة كل صورة قبل نشرها في المعرض.</p>
      <div className="mt-6 grid gap-5 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-32 w-32 overflow-hidden rounded-2xl border border-[#29435F] bg-[#183653]">
            {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={28} aria-hidden="true" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[#A9B8CA]" />}
            {uploading && <div className="absolute inset-0 flex items-center justify-center bg-[#071629]/70"><Loader2 size={24} className="animate-spin text-[#238BE6]" /></div>}
          </div>
          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#29435F] bg-[#112A47] px-4 py-2 text-sm font-bold text-[#F5F7FA] transition hover:border-[#238BE6] ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
            <ImagePlus size={16} /> اختيار صورة
            <input type="file" accept={IMAGE_ACCEPT} className="hidden" disabled={uploading} onChange={event => { const f = event.target.files?.[0]; if (f) pickFile(f); event.target.value = ''; }} />
          </label>
          {file && !uploading && <button type="button" onClick={resetForm} className="text-xs font-bold text-[#F87171]">إزالة</button>}
        </div>
        <div className="space-y-3">
          <div><label className="label">عنوان الصورة *</label><input value={title} onChange={event => setTitle(event.target.value)} disabled={uploading} placeholder="مثال: ورشة البرمجة" className="input mt-2" /></div>
          <div><label className="label">وصف مختصر</label><textarea value={description} onChange={event => setDescription(event.target.value)} disabled={uploading} rows={2} placeholder="وصف الصورة (اختياري)" className="input mt-2" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">التصنيف</label><select value={album} onChange={event => setAlbum(event.target.value)} disabled={uploading} className="input mt-2">{GALLERY_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select></div>
            <div><label className="label">الفعالية (اختياري)</label><select value={eventId} onChange={event => setEventId(event.target.value)} disabled={uploading} className="input mt-2"><option value="">بدون فعالية</option>{events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}</select></div>
          </div>
          {uploading && <div className="h-1.5 overflow-hidden rounded-full bg-[#183653]"><div className="h-full rounded-full bg-[#238BE6] transition-all duration-300" style={{ width: `${progress}%` }} /></div>}
          {error && <p className="text-xs font-bold text-[#FCA5A5]">{error}</p>}
          <button type="button" onClick={submit} disabled={uploading || !file || !title.trim()} className="blue-button disabled:cursor-not-allowed disabled:opacity-50">
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {uploading ? 'جارٍ الإرسال...' : 'إرسال للمراجعة'}
          </button>
        </div>
      </div>
      {notice && <p className={`mt-5 rounded-2xl p-4 text-sm font-bold ${notice.tone === 'success' ? 'bg-[#2E9E5B]/15 text-[#86EFAC]' : 'bg-[#E5484D]/15 text-[#FCA5A5]'}`}>{notice.text}</p>}
      <div className="mt-8 border-t border-[#29435F] pt-6">
        <h3 className="mb-4 font-black text-[#F5F7FA]">صورك المرسلة</h3>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-3">{[1, 2, 3].map(i => <div key={i} className="h-48 animate-pulse rounded-2xl bg-[#112A47]" />)}</div>
        ) : submissions.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#A9B8CA]">لم ترسل أي صورة بعد.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {submissions.map(sub => (
              <article key={sub.id} className="overflow-hidden rounded-2xl border border-[#29435F] bg-[#112A47]">
                <div className="relative aspect-[4/3] bg-[#183653]">
                  <img src={imageUrls[sub.id] ?? sub.media_url} alt={sub.title} loading="lazy" className="h-full w-full object-cover" />
                  <span className={`absolute start-3 top-3 rounded-full px-3 py-1 text-xs font-black ${STATUS_COLORS[sub.status] ?? STATUS_COLORS.pending}`}>{STATUS_LABELS[sub.status] ?? sub.status}</span>
                </div>
                <div className="p-4">
                  <h4 className="truncate font-bold text-[#F5F7FA]">{sub.title}</h4>
                  <p className="mt-1 flex items-center gap-1 text-xs text-[#A9B8CA]"><Clock size={12} /> {formatGalleryDate(galleryItemDate({ created_at: sub.created_at, event_date: null }))}</p>
                  <p className="mt-1 text-xs text-[#A9B8CA]">{sub.album}</p>
                  <button type="button" onClick={() => deleteSubmission(sub)} disabled={sub.status === 'approved'} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#F87171] transition hover:text-[#E5484D] disabled:opacity-30"><Trash2 size={12} /> حذف</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Check, Clock, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { removeFile } from '@/lib/imageUpload';
import { formatGalleryDate, galleryItemDate } from '@/features/gallery/model';

type Submission = {
  id: string;
  title: string;
  description: string;
  album: string;
  storage_path: string;
  media_url: string;
  status: string;
  created_at: string;
  event_id: string | null;
};

const STATUS_LABELS: Record<string, string> = { pending: 'قيد المراجعة', approved: 'مقبولة', rejected: 'مرفوضة' };
const STATUS_COLORS: Record<string, string> = { pending: 'bg-[#D9AC45] text-[#071629]', approved: 'bg-[#2E9E5B] text-white', rejected: 'bg-[#E5484D] text-white' };
const iconBtn = 'flex h-9 w-9 items-center justify-center rounded-xl border border-[#29435F] text-[#F5F7FA] transition hover:border-[#238BE6] hover:text-[#238BE6] disabled:cursor-not-allowed disabled:opacity-40';

type Filter = 'pending' | 'all';

export default function SubmissionsReview() {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const query = supabase.from('image_submissions').select('id, title, description, album, storage_path, media_url, status, created_at, event_id').order('created_at', { ascending: false });
    const { data, error } = filter === 'pending' ? await query.eq('status', 'pending') : await query;
    if (error) setNotice({ tone: 'error', text: 'تعذر تحميل الطلبات.' });
    setSubmissions((data as Submission[] | null) ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const approve = async (sub: Submission) => {
    setBusyId(sub.id);
    const { data: session } = await supabase.auth.getSession();
    const reviewerId = session.session?.user?.id ?? null;

    const { error: insertError } = await supabase.from('gallery_items').insert({
      title: sub.title,
      description: sub.description,
      media_url: sub.media_url,
      storage_path: `member-photos/${sub.storage_path.split('/').pop()}`,
      media_type: 'image',
      album: sub.album,
      event_id: sub.event_id,
      published: true,
    });
    if (insertError) {
      setBusyId(null);
      setNotice({ tone: 'error', text: 'تعذر نسخ الصورة إلى المعرض.' });
      return;
    }

    const { error: updateError } = await supabase.from('image_submissions').update({ status: 'approved', reviewed_by: reviewerId, reviewed_at: new Date().toISOString() }).eq('id', sub.id);
    setBusyId(null);
    if (updateError) { setNotice({ tone: 'error', text: 'تم النشر لكن تعذر تحديث حالة الطلب.' }); return; }
    setNotice({ tone: 'success', text: 'تم قبول الصورة ونشرها في المعرض.' });
    await load();
  };

  const reject = async (sub: Submission) => {
    setBusyId(sub.id);
    const { data: session } = await supabase.auth.getSession();
    const reviewerId = session.session?.user?.id ?? null;
    const { error } = await supabase.from('image_submissions').update({ status: 'rejected', reviewed_by: reviewerId, reviewed_at: new Date().toISOString() }).eq('id', sub.id);
    setBusyId(null);
    if (error) { setNotice({ tone: 'error', text: 'تعذر رفض الطلب.' }); return; }
    setNotice({ tone: 'success', text: 'تم رفض الصورة.' });
    await load();
  };

  const remove = async (sub: Submission) => {
    if (!window.confirm(`حذف الطلب "${sub.title}" نهائياً؟`)) return;
    setBusyId(sub.id);
    const { error: deleteError } = await supabase.from('image_submissions').delete().eq('id', sub.id);
    if (deleteError) { setBusyId(null); setNotice({ tone: 'error', text: 'تعذر حذف الطلب.' }); return; }
    await removeFile('member-photos', sub.storage_path);
    setBusyId(null);
    setNotice({ tone: 'success', text: 'تم حذف الطلب.' });
    await load();
  };

  return (
    <main className="min-h-screen bg-[#071629] pb-16 pt-8 text-[#F5F7FA]">
      <div className="container">
        <button type="button" onClick={() => navigate('/admin/dashboard')} className="soft-button mb-4"><ArrowRight size={16} /> العودة إلى اللوحة</button>
        <span className="eyebrow">مراجعة المحتوى</span>
        <h1 className="mt-2 text-3xl font-black text-[#F5F7FA]">طلبات الصور</h1>
        <p className="mt-2 text-sm text-[#A9B8CA]">صور يرسلها الأعضاء للمراجعة قبل نشرها في المعرض.</p>

        <div className="mt-6 flex gap-2">
          {(['pending', 'all'] as Filter[]).map(f => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-5 py-2.5 text-sm font-bold transition ${filter === f ? 'bg-[#112A47] text-[#F5F7FA]' : 'border border-[#29435F] text-[#A9B8CA] hover:border-[#238BE6]'}`}>
              {f === 'pending' ? 'قيد المراجعة' : 'الكل'}
            </button>
          ))}
        </div>

        {notice && (
          <p role="status" className={`mt-5 flex items-center justify-between gap-4 rounded-2xl p-4 text-sm font-bold ${notice.tone === 'success' ? 'bg-[#2E9E5B]/15 text-[#86EFAC]' : 'bg-[#E5484D]/15 text-[#FCA5A5]'}`}>
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-xs underline">إخفاء</button>
          </p>
        )}

        <div className="mt-8">
          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map(i => <div key={i} className="h-80 animate-pulse rounded-3xl bg-[#112A47]" />)}</div>
          ) : submissions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#29435F] bg-[#0B1D35] px-6 py-16 text-center">
              <p className="font-black text-[#F5F7FA]">لا توجد طلبات {filter === 'pending' ? 'قيد المراجعة' : ''} حالياً.</p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {submissions.map(sub => (
                <article key={sub.id} className="overflow-hidden rounded-3xl border border-[#29435F] bg-[#112A47]">
                  <div className="relative aspect-[4/3] bg-[#0B1D35]">
                    <img src={sub.media_url} alt={sub.title} loading="lazy" className="h-full w-full object-cover" />
                    <span className={`absolute start-3 top-3 rounded-full px-3 py-1 text-xs font-black ${STATUS_COLORS[sub.status] ?? STATUS_COLORS.pending}`}>{STATUS_LABELS[sub.status] ?? sub.status}</span>
                  </div>
                  <div className="p-4">
                    <h3 className="truncate font-black text-[#F5F7FA]">{sub.title}</h3>
                    {sub.description && <p className="mt-1 line-clamp-2 text-xs text-[#A9B8CA]">{sub.description}</p>}
                    <p className="mt-2 flex items-center gap-1 text-xs text-[#A9B8CA]"><Clock size={12} /> {formatGalleryDate(galleryItemDate({ created_at: sub.created_at, event_date: null }))}</p>
                    <p className="mt-1 text-xs text-[#A9B8CA]">{sub.album}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {sub.status === 'pending' && (
                        <>
                          <button type="button" onClick={() => approve(sub)} disabled={busyId === sub.id} aria-label="قبول ونشر" title="قبول ونشر" className={`${iconBtn} text-[#86EFAC] hover:text-[#86EFAC]`}><Check size={15} /></button>
                          <button type="button" onClick={() => reject(sub)} disabled={busyId === sub.id} aria-label="رفض" title="رفض" className={`${iconBtn} text-[#D9AC45] hover:text-[#D9AC45]`}><X size={15} /></button>
                        </>
                      )}
                      <button type="button" onClick={() => remove(sub)} disabled={busyId === sub.id} aria-label="حذف" title="حذف" className={`${iconBtn} text-[#F87171] hover:text-[#F87171]`}><Trash2 size={15} /></button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

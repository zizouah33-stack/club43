import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Download, ImagePlus, LogOut, Pencil, Plus, Search, Settings, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { bucketForResource } from '@/lib/imageUpload';
import ImageField from '@/components/admin/ImageField';

type ResourceKey = 'news' | 'events' | 'activities' | 'places' | 'team_members' | 'membership_applications' | 'messages' | 'event_registrations';
type Row = Record<string, unknown> & { id: string };
type Resource = { key: ResourceKey; label: string; fields: string[]; columns: string[] };

const resources: Resource[] = [
  { key: 'news', label: 'الأخبار', fields: ['title', 'slug', 'excerpt', 'content', 'category', 'image_url'], columns: ['title', 'category', 'published'] },
  { key: 'events', label: 'الفعاليات', fields: ['title', 'description', 'location', 'starts_at', 'ends_at', 'image_url'], columns: ['title', 'location', 'starts_at', 'published'] },
  { key: 'activities', label: 'الأنشطة', fields: ['title', 'domain', 'description', 'activity_date', 'image_url'], columns: ['title', 'domain', 'activity_date', 'published'] },
  { key: 'places', label: 'الأماكن', fields: ['name', 'description', 'latitude', 'longitude', 'image_url'], columns: ['name', 'latitude', 'longitude', 'published'] },
  { key: 'team_members', label: 'الفريق', fields: ['name', 'role', 'photo_url', 'sort_order'], columns: ['name', 'role', 'sort_order', 'published'] },
  { key: 'membership_applications', label: 'طلبات الانخراط', fields: [], columns: ['full_name', 'email', 'status', 'created_at'] },
  { key: 'messages', label: 'الرسائل', fields: [], columns: ['full_name', 'subject', 'is_read', 'created_at'] },
  { key: 'event_registrations', label: 'تسجيلات الفعاليات', fields: [], columns: ['full_name', 'email', 'phone', 'created_at'] },
];

const IMAGE_FIELDS = ['image_url', 'photo_url'];
const emptyForm: Record<string, string> = { title: '', slug: '', excerpt: '', content: '', category: '', description: '', location: '', starts_at: '', ends_at: '', domain: 'scientific', activity_date: '', name: '', latitude: '', longitude: '', role: '', image_url: '', photo_url: '', sort_order: '0' };

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [active, setActive] = useState<ResourceKey>('news');
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [editing, setEditing] = useState<Row | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingPhotos, setPendingPhotos] = useState(0);
  const resource = resources.find(item => item.key === active) ?? resources[0];

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase.from(active).select('*').order('created_at', { ascending: false }).limit(100);
    if (queryError) setError('تعذر تحميل البيانات. حاول مرة أخرى.');
    setRows((data as Row[] | null) ?? []);
    setLoading(false);
  }, [active]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (!data.session) navigate('/login'); });
  }, [navigate]);

  useEffect(() => { load(); setQuery(''); }, [active, load]);

  useEffect(() => {
    const loadCounts = async () => {
      const results = await Promise.all(resources.map(item => supabase.from(item.key).select('id', { count: 'exact', head: true })));
      setCounts(Object.fromEntries(resources.map((item, index) => [item.key, results[index].count ?? 0])));
    };
    loadCounts();
    supabase.from('membership_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending').then(({ count }) => setPendingCount(count ?? 0));
    supabase.from('image_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending').then(({ count }) => setPendingPhotos(count ?? 0));
  }, []);

  const visibleRows = useMemo(() => rows.filter(row => Object.values(row).some(value => String(value ?? '').toLowerCase().includes(query.toLowerCase()))), [rows, query]);
  const openCreate = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (row: Row) => { setEditing(row); setForm(Object.fromEntries(Object.keys(emptyForm).map(key => [key, String(row[key] ?? '')]))); setShowForm(true); };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload: Record<string, unknown> = { ...form };
    ['latitude', 'longitude', 'sort_order'].forEach(key => { if (payload[key] !== '') payload[key] = Number(payload[key]); });
    if (active === 'news' && !payload.published_at) payload.published_at = new Date().toISOString();
    IMAGE_FIELDS.forEach(field => { if (payload[field] === '') payload[field] = null; });
    const result = editing ? await supabase.from(active).update(payload).eq('id', editing.id) : await supabase.from(active).insert(payload);
    if (result.error) setError('تعذر حفظ التغييرات. تأكد من الحقول المطلوبة.');
    else { setShowForm(false); setNotice({ tone: 'success', text: 'تم الحفظ بنجاح.' }); await load(); }
    setSaving(false);
  };

  const remove = async (row: Row) => {
    if (!window.confirm('هل تريد حذف هذا السجل؟')) return;
    const { error: deleteError } = await supabase.from(active).delete().eq('id', row.id);
    if (deleteError) setError('تعذر حذف السجل.');
    else load();
  };

  const updateRow = async (row: Row, values: Record<string, unknown>) => {
    const { error: updateError } = await supabase.from(active).update(values).eq('id', row.id);
    if (updateError) setError('تعذر تحديث السجل.');
    else load();
  };

  const exportCsv = () => {
    const header = resource.columns.join(',');
    const body = rows.map(row => resource.columns.map(column => JSON.stringify(String(row[column] ?? ''))).join(',')).join('\n');
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${active}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const logout = async () => { await supabase.auth.signOut(); navigate('/login'); };

  const sidebarLink = 'flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-right text-sm font-bold transition';

  return (
    <main className="min-h-screen bg-[#071629] pb-16 pt-8 text-[#F5F7FA]">
      <div className="container">
        <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <img src="/logo.png" width="56" height="56" className="h-14 w-14 object-contain" alt="شعار نادي المسار" />
            <div>
              <span className="eyebrow">مساحة الفريق</span>
              <h1 className="mt-2 text-3xl font-black text-[#F5F7FA]">لوحة إدارة نادي المسار</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => navigate('/admin/account')} className="soft-button"><Settings size={16} /> إعدادات الحساب</button>
            <button onClick={logout} className="soft-button"><LogOut size={16} /> تسجيل الخروج</button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[['طلبات الانخراط', 'membership_applications'], ['الرسائل الواردة', 'messages'], ['الفعاليات', 'events']].map(([label, key]) => (
            <div className="rounded-[1.5rem] border border-[#29435F] bg-[#0B1D35] p-5" key={key}>
              <span className="text-sm font-bold text-[#A9B8CA]">{label}</span>
              <strong className="mt-3 block text-3xl font-black text-[#F5F7FA]">{counts[key] ?? 0}</strong>
            </div>
          ))}
        </div>

        {notice && (
          <p role="status" className={`mt-5 flex items-center justify-between gap-4 rounded-2xl p-4 text-sm font-bold ${notice.tone === 'success' ? 'bg-[#2E9E5B]/15 text-[#86EFAC]' : 'bg-[#E5484D]/15 text-[#FCA5A5]'}`}>
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-xs underline">إخفاء</button>
          </p>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[220px_1fr]">
          <aside className="h-fit rounded-[1.5rem] border border-[#29435F] bg-[#0B1D35] p-3">
            <img src="/logo.png" width="96" height="96" className="mx-auto mb-3 h-20 w-20 object-contain" alt="شعار نادي المسار" />
            <p className="px-3 pb-2 text-xs font-black text-[#A9B8CA]">إدارة المحتوى</p>
            <button onClick={() => navigate('/admin/gallery')} className={`${sidebarLink} text-[#A9B8CA] hover:bg-[#238BE6]/10 hover:text-[#238BE6]`}>
              <span>المعرض والصور</span><ImagePlus size={15} />
            </button>
            <button onClick={() => navigate('/admin/submissions')} className={`${sidebarLink} text-[#A9B8CA] hover:bg-[#238BE6]/10 hover:text-[#238BE6]`}>
              <span>طلبات الصور</span>
              {pendingPhotos > 0 && <span className="rounded-full bg-[#D9AC45] px-2 py-0.5 text-xs font-black text-[#071629]">{pendingPhotos}</span>}
            </button>
            {resources.map(item => (
              <button
                key={item.key}
                onClick={() => (item.key === 'membership_applications' ? navigate('/admin/applications') : setActive(item.key))}
                className={`${sidebarLink} ${active === item.key ? 'bg-[#112A47] text-[#F5F7FA]' : 'text-[#A9B8CA] hover:bg-[#238BE6]/10 hover:text-[#238BE6]'}`}
              >
                <span>{item.label}</span>
                {item.key === 'membership_applications' ? <span className="rounded-full bg-[#D9AC45] px-2 py-0.5 text-xs font-black text-[#071629]">{pendingCount}</span> : <span className="text-xs opacity-60">{counts[item.key] ?? 0}</span>}
              </button>
            ))}
          </aside>

          <section className="min-w-0 rounded-[1.5rem] border border-[#29435F] bg-[#0B1D35] p-5 sm:p-7">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-2xl font-black text-[#F5F7FA]">{resource.label}</h2>
                <p className="mt-1 text-sm text-[#A9B8CA]">إدارة السجلات المنشورة والمسودات.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={exportCsv} className="soft-button"><Download size={16} /> CSV</button>
                {resource.fields.length > 0 && <button onClick={openCreate} className="blue-button"><Plus size={16} /> إضافة</button>}
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[#29435F] bg-[#183653] px-4 py-3">
              <Search size={18} className="text-[#A9B8CA]" />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث في السجلات..." className="w-full bg-transparent text-[#F5F7FA] outline-none placeholder:text-[#A9B8CA]" />
            </div>

            {error && (
              <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#E5484D]/15 p-4 text-sm font-bold text-[#FCA5A5]">
                <span>{error}</span>
                <button onClick={() => setError('')}><X size={16} /></button>
              </div>
            )}

            {loading ? (
              <div className="mt-6 grid gap-3">{[1, 2, 3].map(item => <div className="h-16 animate-pulse rounded-2xl bg-[#112A47]" key={item} />)}</div>
            ) : visibleRows.length === 0 ? (
              <div className="py-16 text-center text-[#A9B8CA]">لا توجد سجلات مطابقة حالياً.</div>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[680px] text-right text-sm">
                  <thead>
                    <tr className="border-b border-[#29435F] text-xs text-[#A9B8CA]">
                      {resource.columns.map(column => <th className="px-3 pb-3 font-bold" key={column}>{column}</th>)}
                      <th className="pb-3">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map(row => (
                      <tr className="border-b border-[#29435F]/60" key={row.id}>
                        {resource.columns.map(column => (
                          <td className="max-w-[240px] truncate px-3 py-4 font-bold text-[#F5F7FA]" key={column}>
                            {column === 'published' || column === 'is_read' ? (
                              <button onClick={() => updateRow(row, { [column]: !row[column] })} className={`rounded-full px-3 py-1 text-xs ${row[column] ? 'bg-[#2E9E5B]/20 text-[#86EFAC]' : 'bg-[#29435F] text-[#A9B8CA]'}`}>{row[column] ? 'نعم' : 'لا'}</button>
                            ) : column === 'image_url' || column === 'photo_url' ? (
                              row[column] ? <img src={String(row[column])} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <span className="text-[#A9B8CA]">—</span>
                            ) : (
                              String(row[column] ?? '—')
                            )}
                          </td>
                        ))}
                        <td className="whitespace-nowrap">
                          <button onClick={() => openEdit(row)} className="icon-button ml-1" aria-label="تعديل"><Pencil size={15} /></button>
                          <button onClick={() => remove(row)} className="icon-button text-[#F87171]" aria-label="حذف"><Trash2 size={15} /></button>
                          {active === 'membership_applications' && <button onClick={() => updateRow(row, { status: 'approved' })} className="icon-button mr-1 text-[#86EFAC]" aria-label="قبول"><Check size={15} /></button>}
                          {active === 'messages' && <button onClick={() => updateRow(row, { is_read: true })} className="mr-1 text-xs font-bold text-[#238BE6]">قراءة</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>

      {showForm && <FormModal resource={resource} form={form} setForm={setForm} saving={saving} editing={editing} onClose={() => setShowForm(false)} onSave={save} />}
    </main>
  );
}

const TEXTAREA_FIELDS = ['description', 'content', 'excerpt'];
const DATETIME_FIELDS = ['starts_at', 'ends_at', 'activity_date'];
const NUMBER_FIELDS = ['latitude', 'longitude', 'sort_order'];

function FormModal({ resource, form, setForm, saving, editing, onClose, onSave }: {
  resource: Resource;
  form: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  saving: boolean;
  editing: Row | null;
  onClose: () => void;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const bucket = bucketForResource(resource.key);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#071629]/80 p-4 backdrop-blur-sm">
      <form onSubmit={onSave} className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-[2rem] border border-[#29435F] bg-[#0B1D35] p-6 shadow-2xl sm:p-8">
        <div className="flex items-center justify-between">
          <div>
            <span className="eyebrow">{editing ? 'تعديل' : 'إضافة جديدة'}</span>
            <h2 className="mt-2 text-2xl font-black text-[#F5F7FA]">{resource.label}</h2>
          </div>
          <button type="button" onClick={onClose} className="icon-button" aria-label="إغلاق"><X size={18} /></button>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          {resource.fields.map(field => {
            const isTextarea = TEXTAREA_FIELDS.includes(field);
            const isImage = IMAGE_FIELDS.includes(field);
            if (isImage) {
              return (
                <div className="sm:col-span-2" key={field}>
                  <ImageField
                    bucket={bucket}
                    folder={resource.key}
                    value={form[field] ?? ''}
                    onChange={url => setForm(previous => ({ ...previous, [field]: url }))}
                    label={field === 'photo_url' ? 'الصورة الشخصية' : 'صورة الغلاف'}
                    disabled={saving}
                  />
                </div>
              );
            }
            if (isTextarea) {
              return (
                <div className={field === 'content' || field === 'description' ? 'sm:col-span-2' : ''} key={field}>
                  <label className="label">{field}</label>
                  <textarea rows={field === 'content' ? 8 : 4} value={form[field] ?? ''} onChange={event => setForm(previous => ({ ...previous, [field]: event.target.value }))} className="input mt-2" />
                </div>
              );
            }
            const inputType = DATETIME_FIELDS.includes(field) ? 'datetime-local' : NUMBER_FIELDS.includes(field) ? 'number' : 'text';
            return (
              <div key={field}>
                <label className="label">{field}</label>
                <input type={inputType} value={form[field] ?? ''} onChange={event => setForm(previous => ({ ...previous, [field]: event.target.value }))} className="input mt-2" />
              </div>
            );
          })}
        </div>

        <div className="mt-7 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="soft-button">إلغاء</button>
          <button type="submit" disabled={saving} className="blue-button disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
          </button>
        </div>
      </form>
    </div>
  );
}

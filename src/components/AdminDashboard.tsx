import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Download, ImagePlus, LogOut, Pencil, Plus, Search, Settings, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

type ResourceKey = 'news' | 'events' | 'activities' | 'places' | 'team_members' | 'membership_applications' | 'messages' | 'event_registrations';
type Row = Record<string, unknown> & { id: string };
type Resource = { key: ResourceKey; label: string; fields: string[]; columns: string[] };

const resources: Resource[] = [
  { key: 'news', label: 'الأخبار', fields: ['title', 'slug', 'excerpt', 'content', 'category'], columns: ['title', 'category', 'published'] },
  { key: 'events', label: 'الفعاليات', fields: ['title', 'description', 'location', 'starts_at', 'ends_at'], columns: ['title', 'location', 'starts_at', 'published'] },
  { key: 'activities', label: 'الأنشطة', fields: ['title', 'domain', 'description', 'activity_date'], columns: ['title', 'domain', 'activity_date', 'published'] },
  { key: 'places', label: 'الأماكن', fields: ['name', 'description', 'latitude', 'longitude'], columns: ['name', 'latitude', 'longitude', 'published'] },
  { key: 'team_members', label: 'الفريق', fields: ['name', 'role', 'photo_url', 'sort_order'], columns: ['name', 'role', 'sort_order', 'published'] },
  { key: 'membership_applications', label: 'طلبات الانخراط', fields: [], columns: ['full_name', 'email', 'status', 'created_at'] },
  { key: 'messages', label: 'الرسائل', fields: [], columns: ['full_name', 'subject', 'is_read', 'created_at'] },
  { key: 'event_registrations', label: 'تسجيلات الفعاليات', fields: [], columns: ['full_name', 'email', 'phone', 'created_at'] },
];

const emptyForm: Record<string, string> = { title: '', slug: '', excerpt: '', content: '', category: '', description: '', location: '', starts_at: '', ends_at: '', domain: 'scientific', activity_date: '', name: '', latitude: '', longitude: '', role: '', photo_url: '', sort_order: '0' };

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
  const [pendingCount, setPendingCount] = useState(0);
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
    const result = editing ? await supabase.from(active).update(payload).eq('id', editing.id) : await supabase.from(active).insert(payload);
    if (result.error) setError('تعذر حفظ التغييرات. تأكد من الحقول المطلوبة.');
    else { setShowForm(false); await load(); }
    setSaving(false);
  };
  const remove = async (row: Row) => { if (!window.confirm('هل تريد حذف هذا السجل؟')) return; const { error: deleteError } = await supabase.from(active).delete().eq('id', row.id); if (deleteError) setError('تعذر حذف السجل.'); else load(); };
  const updateRow = async (row: Row, values: Record<string, unknown>) => { const { error: updateError } = await supabase.from(active).update(values).eq('id', row.id); if (updateError) setError('تعذر تحديث السجل.'); else load(); };
  const upload = async (file: File, field: string) => { const extension = file.name.split('.').pop() ?? 'bin'; const path = `${crypto.randomUUID()}.${extension}`; const bucket = active === 'team_members' ? 'team' : active === 'places' ? 'places' : 'news'; const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, { upsert: false }); if (uploadError) { setError('تعذر رفع الملف.'); return; } const { data } = supabase.storage.from(bucket).getPublicUrl(path); setForm(previous => ({ ...previous, [field]: data.publicUrl })); };
  const exportCsv = () => { const header = resource.columns.join(','); const body = rows.map(row => resource.columns.map(column => JSON.stringify(String(row[column] ?? ''))).join(',')).join('\n'); const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${active}.csv`; anchor.click(); URL.revokeObjectURL(url); };
  const logout = async () => { await supabase.auth.signOut(); navigate('/login'); };

  return <div className="min-h-screen bg-sand dark:bg-[#081a32]"><div className="container py-8"><div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div className="flex items-center gap-4"><img src="/logo.png" width="56" height="56" className="h-14 w-14 object-contain" alt="شعار نادي المسار" /><div><span className="eyebrow">مساحة الفريق</span><h1 className="mt-2 text-3xl font-black text-navy dark:text-white">لوحة إدارة نادي المسار</h1></div></div><button onClick={() => navigate('/admin/account')} className="soft-button"><Settings size={16} /> إعدادات الحساب</button><button onClick={logout} className="soft-button"><LogOut size={16} /> تسجيل الخروج</button></div><div className="grid gap-4 sm:grid-cols-3">{[['طلبات الانخراط', 'membership_applications'], ['الرسائل الواردة', 'messages'], ['الفعاليات', 'events']].map(([label, key]) => <div className="soft-card p-5" key={key}><span className="text-sm font-bold text-muted">{label}</span><strong className="mt-3 block text-3xl font-black text-navy dark:text-white">{counts[key] ?? 0}</strong></div>)}</div><div className="mt-8 grid gap-6 lg:grid-cols-[220px_1fr]"><aside className="soft-card h-fit p-3"><img src="/logo.png" width="96" height="96" className="mx-auto mb-3 h-20 w-20 object-contain" alt="شعار نادي المسار" /><p className="px-3 pb-2 text-xs font-black text-muted">إدارة المحتوى</p><button onClick={() => navigate('/admin/gallery')} className="flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-right text-sm font-bold text-muted transition hover:bg-blue/10 hover:text-blue"><span>المعرض والصور</span><ImagePlus size={15} /></button>{resources.map(item => <button key={item.key} onClick={() => (item.key === 'membership_applications' ? navigate('/admin/applications') : setActive(item.key))} className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-right text-sm font-bold transition ${active === item.key ? 'bg-navy text-white' : 'text-muted hover:bg-blue/10 hover:text-blue'}`}><span>{item.label}</span>{item.key === 'membership_applications' ? <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-black text-navy">{pendingCount}</span> : <span className="text-xs opacity-60">{counts[item.key] ?? 0}</span>}</button>)}</aside><section className="soft-card min-w-0 p-5 sm:p-7"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-2xl font-black text-navy dark:text-white">{resource.label}</h2><p className="mt-1 text-sm text-muted">إدارة السجلات المنشورة والمسودات.</p></div><div className="flex gap-2"><button onClick={exportCsv} className="soft-button"><Download size={16} /> CSV</button>{resource.fields.length > 0 && <button onClick={openCreate} className="blue-button"><Plus size={16} /> إضافة</button>}</div></div><div className="mt-6 flex items-center gap-3 rounded-2xl border border-navy/10 bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-white/5"><Search size={18} className="text-muted" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث في السجلات..." className="w-full bg-transparent outline-none placeholder:text-muted" /></div>{error && <div className="mt-4 flex items-center justify-between rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-700"><span>{error}</span><button onClick={() => setError('')}><X size={16} /></button></div>}{loading ? <div className="mt-6 grid gap-3">{[1, 2, 3].map(item => <div className="h-16 animate-pulse rounded-2xl bg-navy/5 dark:bg-white/5" key={item} />)}</div> : visibleRows.length === 0 ? <div className="py-16 text-center text-muted">لا توجد سجلات مطابقة حالياً.</div> : <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[680px] text-right text-sm"><thead><tr className="border-b border-navy/10 text-xs text-muted dark:border-white/10">{resource.columns.map(column => <th className="px-3 pb-3 font-bold" key={column}>{column}</th>)}<th className="pb-3">إجراء</th></tr></thead><tbody>{visibleRows.map(row => <tr className="border-b border-navy/5 dark:border-white/5" key={row.id}>{resource.columns.map(column => <td className="max-w-[240px] truncate px-3 py-4 font-bold text-navy dark:text-white" key={column}>{column === 'published' || column === 'is_read' ? <button onClick={() => updateRow(row, { [column]: !row[column] })} className={`rounded-full px-3 py-1 text-xs ${row[column] ? 'bg-teal/15 text-teal' : 'bg-navy/10 text-muted'}`}>{row[column] ? 'نعم' : 'لا'}</button> : String(row[column] ?? '—')}</td>)}<td className="whitespace-nowrap"><button onClick={() => openEdit(row)} className="icon-button ml-1"><Pencil size={15} /></button><button onClick={() => remove(row)} className="icon-button text-red-600"><Trash2 size={15} /></button>{active === 'membership_applications' && <><button onClick={() => updateRow(row, { status: 'approved' })} className="icon-button mr-1 text-teal"><Check size={15} /></button></>}{active === 'messages' && <button onClick={() => updateRow(row, { is_read: true })} className="mr-1 text-xs font-bold text-blue">قراءة</button>}</td></tr>)}</tbody></table></div>}</section></div></div>{showForm && <FormModal resource={resource} form={form} setForm={setForm} saving={saving} editing={editing} onClose={() => setShowForm(false)} onSave={save} onUpload={upload} />}</div>;
}

function FormModal({ resource, form, setForm, saving, editing, onClose, onSave, onUpload }: { resource: Resource; form: Record<string, string>; setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>; saving: boolean; editing: Row | null; onClose: () => void; onSave: (event: React.FormEvent<HTMLFormElement>) => void; onUpload: (file: File, field: string) => void }) {
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-navy/60 p-4 backdrop-blur-sm"><form onSubmit={onSave} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-sand p-6 shadow-2xl dark:bg-[#102b4c] sm:p-8"><div className="flex items-center justify-between"><div><span className="eyebrow">{editing ? 'تعديل' : 'إضافة جديدة'}</span><h2 className="mt-2 text-2xl font-black text-navy dark:text-white">{resource.label}</h2></div><button type="button" onClick={onClose} className="icon-button"><X size={18} /></button></div><div className="mt-7 grid gap-4 sm:grid-cols-2">{resource.fields.map(field => <div className={field === 'description' || field === 'content' || field === 'excerpt' ? 'sm:col-span-2' : ''} key={field}><label className="label">{field}</label>{field === 'description' || field === 'content' || field === 'excerpt' ? <textarea rows={field === 'content' ? 8 : 4} value={form[field] ?? ''} onChange={event => setForm(previous => ({ ...previous, [field]: event.target.value }))} className="input mt-2" /> : <div className="mt-2 flex gap-2"><input type={field.includes('at') || field.includes('date') ? 'datetime-local' : field === 'latitude' || field === 'longitude' || field === 'sort_order' ? 'number' : 'text'} value={form[field] ?? ''} onChange={event => setForm(previous => ({ ...previous, [field]: event.target.value }))} className="input" />{field === 'photo_url' && <label className="icon-button shrink-0 cursor-pointer"><ImagePlus size={17} /><input type="file" accept="image/*" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) onUpload(file, field); }} /></label>}</div>}</div>)}</div><div className="mt-7 flex justify-end gap-3"><button type="button" onClick={onClose} className="soft-button">إلغاء</button><button disabled={saving} className="blue-button">{saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}</button></div></form></div>;
}

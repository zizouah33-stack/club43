import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, ArrowUpDown, Check, ChevronLeft, ChevronRight, Download, Eye, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { invokeAdminFunction } from '@/lib/edgeFunctions';
import ApplicationDrawer from '@/components/admin/ApplicationDrawer';
import { ageFromIso } from '@/features/membership/schema';
import { STATUS_BADGE, STATUS_LABEL, type Application, type ApplicationStatus } from '@/features/membership/types';

const PAGE_SIZE = 10;
const COLUMNS =
  'id, full_name, first_name, last_name, email, phone, birth_date, gender, address, education_or_job, interests, motivation, guardian_name, guardian_phone, guardian_consent, bylaws_accepted, status, rejection_reason, reviewed_at, membership_number, created_at';

type Filter = 'all' | ApplicationStatus;
const FILTERS: Filter[] = ['pending', 'approved', 'rejected', 'all'];
const FILTER_LABEL: Record<Filter, string> = {
  all: 'الكل',
  pending: 'قيد المراجعة',
  approved: 'مقبولة',
  rejected: 'مرفوضة',
};

function buildQuery(filter: Filter, search: string) {
  let query = supabase.from('membership_applications').select(COLUMNS, { count: 'exact' });
  if (filter !== 'all') query = query.eq('status', filter);
  const term = search.replace(/[%,()*]/g, '').trim();
  if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
  return query;
}

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? '');
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function fullName(row: Application) {
  return [row.first_name, row.last_name].filter(Boolean).join(' ') || row.full_name;
}

export default function ApplicationsInbox() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('pending');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [ascending, setAscending] = useState(false);
  const [rows, setRows] = useState<Application[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Application | null>(null);
  const [rejecting, setRejecting] = useState<Application | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshPending = useCallback(() => {
    supabase
      .from('membership_applications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => setPendingCount(count ?? 0));
  }, []);

  const refreshAll = useCallback(() => {
    setRefreshKey((key) => key + 1);
    refreshPending();
  }, [refreshPending]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate('/login');
    });
  }, [navigate]);

  useEffect(() => {
    let active = true;
    buildQuery(filter, search)
      .order('created_at', { ascending })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      .then(({ data, count, error: queryError }) => {
        if (!active) return;
        setLoading(false);
        if (queryError) {
          setError('تعذر تحميل الطلبات. حاول مرة أخرى.');
          return;
        }
        setError('');
        setRows((data as Application[] | null) ?? []);
        setTotal(count ?? 0);
      });
    return () => {
      active = false;
    };
  }, [filter, search, page, ascending, refreshKey]);

  useEffect(() => {
    refreshPending();
    const channel = supabase
      .channel('membership-applications-inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'membership_applications' }, () => {
        setToast('وصل طلب انخراط جديد');
        refreshAll();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshPending, refreshAll]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const changeFilter = (next: Filter) => {
    setLoading(true);
    setFilter(next);
    setPage(0);
  };

  const review = async (row: Application, status: 'approved' | 'rejected', rejectionReason: string | null) => {
    setBusy(true);
    const result =
      status === 'approved'
        ? await invokeAdminFunction<{ membership_number?: string }>('approve-member', { application_id: row.id })
        : await invokeAdminFunction<{ email_status?: string }>('reject-application', { application_id: row.id, reason: rejectionReason ?? '' });
    setBusy(false);
    if (result.errorMessage) {
      setError(result.errorMessage);
      return;
    }
    setToast(status === 'approved' ? 'تم قبول الطلب وإنشاء العضوية' : 'تم رفض الطلب');
    setSelected(null);
    setRejecting(null);
    setReason('');
    refreshAll();
  };

  const exportCsv = async () => {
    const { data, error: exportError } = await buildQuery(filter, search)
      .order('created_at', { ascending: false })
      .limit(5000);
    if (exportError) {
      setError('تعذر تصدير الملف. حاول مرة أخرى.');
      return;
    }
    const header = ['الاسم', 'اللقب', 'البريد الإلكتروني', 'الهاتف', 'تاريخ الميلاد', 'الجنس', 'الحالة', 'تاريخ الطلب'];
    const lines = (data as Application[]).map((row) =>
      [
        row.first_name ?? row.full_name,
        row.last_name ?? '',
        row.email,
        row.phone,
        row.birth_date ?? '',
        row.gender ?? '',
        STATUS_LABEL[row.status],
        row.created_at,
      ]
        .map(csvCell)
        .join(','),
    );
    const blob = new Blob(['\uFEFF' + [header.map(csvCell).join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `membership-applications-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageLabel = `${page + 1} / ${totalPages}`;

  return (
    <main className="min-h-screen bg-sand px-4 py-8 dark:bg-navy sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <button type="button" onClick={() => navigate('/admin/dashboard')} className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-blue">
              <ArrowRight size={16} /> العودة إلى لوحة الإدارة
            </button>
            <h1 className="text-2xl font-black text-navy dark:text-white">طلبات الانخراط</h1>
            <p className="mt-1 text-sm text-muted">
              قيد المراجعة: <span className="font-black text-navy dark:text-white">{pendingCount}</span>
            </p>
          </div>
          <button type="button" onClick={() => navigate('/admin/members')} className="soft-button min-h-11">الأعضاء والسجلات</button>
          <button type="button" onClick={() => navigate('/admin/content')} className="soft-button min-h-11">نصوص الموقع</button>
          <button type="button" onClick={() => navigate('/admin/staff')} className="soft-button min-h-11">حسابات الإدارة</button>
          <button type="button" onClick={() => void exportCsv()} className="soft-button min-h-11">
            <Download size={16} /> تصدير CSV
          </button>
        </header>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div role="tablist" aria-label="تصفية الطلبات" className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={filter === item}
                onClick={() => changeFilter(item)}
                className={`min-h-11 rounded-full px-4 text-sm font-bold transition ${
                  filter === item ? 'bg-navy text-white' : 'bg-white text-navy hover:bg-blue/10 dark:bg-white/10 dark:text-white'
                }`}
              >
                {FILTER_LABEL[item]}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <label className="relative flex-1 sm:w-72">
              <span className="sr-only">بحث بالاسم أو البريد</span>
              <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setPage(0);
                  setSearch(event.target.value);
                }}
                placeholder="بحث بالاسم أو البريد"
                className="input ps-9"
              />
            </label>
            <button
              type="button"
              onClick={() => setAscending((value) => !value)}
              aria-label="ترتيب حسب التاريخ"
              className="soft-button min-h-11 shrink-0"
            >
              <ArrowUpDown size={16} /> {ascending ? 'الأقدم' : 'الأحدث'}
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-700">
            {error}
            <button type="button" onClick={refreshAll} className="soft-button min-h-9 px-3 text-red-700">إعادة المحاولة</button>
          </div>
        )}

        <section className="mt-6">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-20 animate-pulse rounded-2xl bg-navy/5 dark:bg-white/5" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="soft-card p-10 text-center">
              <p className="font-black text-navy dark:text-white">لا توجد طلبات مطابقة</p>
              <p className="mt-2 text-sm text-muted">ستظهر هنا طلبات الانخراط الجديدة فور وصولها.</p>
            </div>
          ) : (
            <>
              <ul className="space-y-3 sm:hidden">
                {rows.map((row) => (
                  <li key={row.id} className="soft-card space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-black text-navy dark:text-white">{fullName(row)}</p>
                        <p className="truncate text-xs text-muted" dir="ltr">{row.email}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${STATUS_BADGE[row.status]}`}>{STATUS_LABEL[row.status]}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted">
                      <span>{new Date(row.created_at).toLocaleDateString('ar-DZ')}</span>
                      <button type="button" onClick={() => setSelected(row)} className="inline-flex min-h-11 items-center gap-1 font-bold text-blue">
                        <Eye size={16} /> التفاصيل
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="soft-card hidden overflow-x-auto sm:block">
                <table className="w-full text-start text-sm">
                  <thead className="bg-navy/5 text-xs text-muted dark:bg-white/5">
                    <tr>
                      <th className="p-4 font-bold">الاسم</th>
                      <th className="p-4 font-bold">البريد</th>
                      <th className="p-4 font-bold">العمر</th>
                      <th className="p-4 font-bold">التاريخ</th>
                      <th className="p-4 font-bold">الحالة</th>
                      <th className="p-4 font-bold"><span className="sr-only">إجراءات</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t border-navy/10 dark:border-white/10">
                        <td className="p-4 font-bold text-navy dark:text-white">{fullName(row)}</td>
                        <td className="p-4 text-muted" dir="ltr">{row.email}</td>
                        <td className="p-4 text-navy dark:text-white">{row.birth_date ? ageFromIso(row.birth_date) : '—'}</td>
                        <td className="p-4 text-muted">{new Date(row.created_at).toLocaleDateString('ar-DZ')}</td>
                        <td className="p-4">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_BADGE[row.status]}`}>{STATUS_LABEL[row.status]}</span>
                        </td>
                        <td className="p-4">
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setSelected(row)} aria-label="عرض التفاصيل" className="icon-button"><Eye size={16} /></button>
                            {row.status === 'pending' && (
                              <>
                                <button type="button" disabled={busy} onClick={() => void review(row, 'approved', null)} aria-label="قبول" className="icon-button text-teal disabled:opacity-50"><Check size={16} /></button>
                                <button type="button" disabled={busy} onClick={() => setRejecting(row)} aria-label="رفض" className="icon-button text-red-700 disabled:opacity-50"><X size={16} /></button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <nav className="mt-5 flex items-center justify-between gap-3 text-sm" aria-label="ترقيم الصفحات">
                <span className="text-muted">{total} طلب</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0} aria-label="الصفحة السابقة" className="icon-button disabled:opacity-40"><ChevronRight size={16} /></button>
                  <span className="min-w-16 text-center font-bold text-navy dark:text-white">{pageLabel}</span>
                  <button type="button" onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))} disabled={page >= totalPages - 1} aria-label="الصفحة التالية" className="icon-button disabled:opacity-40"><ChevronLeft size={16} /></button>
                </div>
              </nav>
            </>
          )}
        </section>
      </div>

      {selected && (
        <ApplicationDrawer
          application={selected}
          busy={busy}
          onClose={() => setSelected(null)}
          onApprove={(row) => void review(row, 'approved', null)}
          onReject={(row) => setRejecting(row)}
        />
      )}

      {rejecting && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-navy/50 p-4" role="dialog" aria-modal="true" aria-labelledby="reject-title">
          <div className="soft-card w-full max-w-md space-y-5 p-6">
            <h2 id="reject-title" className="text-lg font-black text-navy dark:text-white">رفض طلب {fullName(rejecting)}</h2>
            <label className="block">
              <span className="label">سبب الرفض (اختياري)</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={500} className="input mt-2" />
            </label>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setRejecting(null); setReason(''); }} className="soft-button min-h-11">إلغاء</button>
              <button type="button" disabled={busy} onClick={() => void review(rejecting, 'rejected', reason.trim() || null)} className="blue-button min-h-11 bg-red-700 disabled:opacity-60">
                تأكيد الرفض
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed bottom-4 start-4 z-[100] rounded-2xl bg-navy px-5 py-3 text-sm font-bold text-white shadow-2xl">
          {toast}
        </div>
      )}
    </main>
  );
}

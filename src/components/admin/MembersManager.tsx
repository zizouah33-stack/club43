import { useCallback, useEffect, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { invokeAdminFunction } from '@/lib/edgeFunctions';

type MemberRow = {
  id: string;
  membership_number: string;
  full_name: string;
  real_email: string;
  phone: string;
  status: 'active' | 'suspended' | 'expelled';
  must_change_password: boolean;
  joined_at: string;
  application_id: string | null;
};

type Action = 'suspend' | 'reactivate' | 'expel' | 'reset_password' | 'resend_approval';

const PAGE_SIZE = 10;
const STATUS_LABEL: Record<MemberRow['status'], string> = { active: 'نشط', suspended: 'موقوف', expelled: 'مطرود' };
const STATUS_BADGE: Record<MemberRow['status'], string> = {
  active: 'bg-teal/15 text-teal',
  suspended: 'bg-gold/25 text-navy',
  expelled: 'bg-red-500/10 text-red-700',
};
const ACTION_LABEL: Record<Action, string> = {
  suspend: 'إيقاف العضوية',
  reactivate: 'إعادة التفعيل',
  expel: 'طرد العضو',
  reset_password: 'إعادة تعيين كلمة السر إلى تاريخ الميلاد',
  resend_approval: 'إعادة إرسال بريد القبول',
};

const SHORT_LABEL: Record<Action, string> = {
  suspend: 'إيقاف',
  reactivate: 'تفعيل',
  expel: 'طرد',
  reset_password: 'كلمة السر',
  resend_approval: 'قبول البريد',
};

const SELECT_COLUMNS = 'id, membership_number, full_name, real_email, phone, status, must_change_password, joined_at, application_id';

function csvCell(value: string | number | boolean | null | undefined) {
  const text = String(value ?? '');
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export default function MembersManager() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | MemberRow['status']>('all');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<{ row: MemberRow; action: Action } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const buildQuery = useCallback(() => {
    let query = supabase.from('members').select(SELECT_COLUMNS, { count: 'exact' });
    if (status !== 'all') query = query.eq('status', status);
    const term = search.replace(/[%,()*]/g, '').trim();
    if (term) query = query.or(`full_name.ilike.%${term}%,membership_number.ilike.%${term}%,real_email.ilike.%${term}%`);
    return query;
  }, [search, status]);

  useEffect(() => {
    let active = true;
    buildQuery()
      .order('joined_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      .then(({ data, count, error: queryError }) => {
        if (!active) return;
        setLoading(false);
        if (queryError) {
          setError('تعذر تحميل قائمة الأعضاء. حاول مرة أخرى.');
          return;
        }
        setError('');
        setRows((data as MemberRow[] | null) ?? []);
        setTotal(count ?? 0);
      });
    return () => {
      active = false;
    };
  }, [buildQuery, page, refresh]);

  const runAction = async () => {
    if (!pending) return;
    setBusy(true);
    setNotice('');
    const { row, action } = pending;
    const result =
      action === 'resend_approval'
        ? await invokeAdminFunction<{ status?: string }>('send-email', { type: 'approval', application_id: row.application_id })
        : await invokeAdminFunction<{ status?: string; ok?: boolean }>('manage-member', { member_id: row.id, action });
    setBusy(false);
    setPending(null);
    if (result.errorMessage) {
      setError(result.errorMessage);
      return;
    }
    if (action === 'resend_approval') {
      setNotice(result.data?.status === 'sent' ? 'تم إرسال بريد القبول.' : 'ما زال إرسال البريد متعذراً.');
    } else {
      setNotice('تم تنفيذ الإجراء.');
    }
    setRefresh((value) => value + 1);
  };

  const exportCsv = async () => {
    const { data, error: exportError } = await buildQuery().order('joined_at', { ascending: false }).limit(5000);
    if (exportError) {
      setError('تعذر تصدير الملف. حاول مرة أخرى.');
      return;
    }
    const header = ['رقم العضوية', 'الاسم', 'البريد', 'الهاتف', 'الحالة', 'تاريخ الانخراط'];
    const lines = (data as MemberRow[]).map((row) =>
      [row.membership_number, row.full_name, row.real_email, row.phone, STATUS_LABEL[row.status], row.joined_at].map(csvCell).join(','),
    );
    const blob = new Blob(['\uFEFF' + [header.map(csvCell).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `members-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const actionsFor = (row: MemberRow): Action[] => {
    const lifecycle: Action[] = row.status === 'active' ? ['suspend', 'expel'] : row.status === 'suspended' ? ['reactivate', 'expel'] : [];
    return [...lifecycle, 'reset_password', ...(row.application_id ? (['resend_approval'] as Action[]) : [])];
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="تصفية حسب الحالة" className="flex flex-wrap gap-2">
          {(['all', 'active', 'suspended', 'expelled'] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={status === item}
              onClick={() => {
                setLoading(true);
                setStatus(item);
                setPage(0);
              }}
              className={`min-h-11 rounded-full px-4 text-sm font-bold transition ${status === item ? 'bg-navy text-white' : 'bg-white text-navy hover:bg-blue/10 dark:bg-white/10 dark:text-white'}`}
            >
              {item === 'all' ? 'الكل' : STATUS_LABEL[item]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <label className="relative flex-1 sm:w-72">
            <span className="sr-only">بحث بالاسم أو رقم العضوية</span>
            <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setLoading(true);
                setPage(0);
                setSearch(event.target.value);
              }}
              placeholder="بحث بالاسم أو رقم العضوية"
              className="input ps-9"
            />
          </label>
          <button type="button" onClick={() => void exportCsv()} className="soft-button min-h-11 shrink-0">
            <Download size={16} /> CSV
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-700">
          {error}
          <button type="button" onClick={() => setRefresh((value) => value + 1)} className="soft-button min-h-9 px-3 text-red-700">إعادة المحاولة</button>
        </div>
      )}
      {notice && <p role="status" className="rounded-2xl bg-teal/10 p-4 text-sm font-bold text-teal">{notice}</p>}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-2xl bg-navy/5 dark:bg-white/5" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="soft-card p-10 text-center">
          <p className="font-black text-navy dark:text-white">لا يوجد أعضاء مطابقون</p>
          <p className="mt-2 text-sm text-muted">ستظهر هنا العضويات بعد قبول طلبات الانخراط.</p>
        </div>
      ) : (
        <div className="soft-card overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="bg-navy/5 text-xs text-muted dark:bg-white/5">
              <tr>
                <th className="p-4 font-bold">رقم العضوية</th>
                <th className="p-4 font-bold">الاسم</th>
                <th className="p-4 font-bold">الهاتف</th>
                <th className="p-4 font-bold">الحالة</th>
                <th className="p-4 font-bold"><span className="sr-only">إجراءات</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-navy/10 dark:border-white/10">
                  <td className="p-4 font-mono font-bold text-navy dark:text-white" dir="ltr">{row.membership_number}</td>
                  <td className="p-4">
                    <p className="font-bold text-navy dark:text-white">{row.full_name}</p>
                    <p className="text-xs text-muted" dir="ltr">{row.real_email}</p>
                  </td>
                  <td className="p-4 text-muted" dir="ltr">{row.phone}</td>
                  <td className="p-4">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_BADGE[row.status]}`}>{STATUS_LABEL[row.status]}</span>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap justify-end gap-2">
                      {actionsFor(row).map((action) => (
                        <button key={action} type="button" disabled={busy} onClick={() => setPending({ row, action })} className="soft-button min-h-9 px-3 text-xs disabled:opacity-60">
                          {SHORT_LABEL[action]}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav className="flex items-center justify-between gap-3 text-sm" aria-label="ترقيم الصفحات">
        <span className="text-muted">{total} عضو</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0} className="soft-button min-h-9 px-3 disabled:opacity-40">السابق</button>
          <span className="font-bold text-navy dark:text-white">{page + 1} / {totalPages}</span>
          <button type="button" onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))} disabled={page >= totalPages - 1} className="soft-button min-h-9 px-3 disabled:opacity-40">التالي</button>
        </div>
      </nav>

      {pending && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-navy/50 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-action-title">
          <div className="soft-card w-full max-w-md space-y-5 p-6">
            <h2 id="confirm-action-title" className="text-lg font-black text-navy dark:text-white">{ACTION_LABEL[pending.action]}</h2>
            <p className="text-sm leading-6 text-muted">
              العضو: <span className="font-bold text-navy dark:text-white">{pending.row.full_name}</span> ({pending.row.membership_number})
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setPending(null)} className="soft-button min-h-11">إلغاء</button>
              <button type="button" disabled={busy} onClick={() => void runAction()} className="blue-button min-h-11 disabled:opacity-60">تأكيد</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

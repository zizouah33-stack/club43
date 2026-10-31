import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Role = 'super_admin' | 'admin' | 'editor';
type StaffRow = { user_id: string; email: string; display_name: string | null; role: Role; created_at: string };

const ROLE_LABEL: Record<Role, string> = { super_admin: 'مدير أعلى', admin: 'مشرف', editor: 'محرر محتوى' };
const ROLES: Role[] = ['super_admin', 'admin', 'editor'];

const ERROR_LABEL: Record<string, string> = {
  USER_NOT_FOUND: 'لا يوجد حساب بهذا البريد. يجب أن يسجل المستخدم أولاً.',
  EMAIL_NOT_CONFIRMED: 'البريد الإلكتروني لهذا الحساب غير مؤكد.',
  SELF_DEMOTION: 'لا يمكنك إزالة صلاحياتك بنفسك.',
  LAST_SUPER_ADMIN: 'لا يمكن إزالة آخر مدير أعلى في المنصة.',
  FORBIDDEN: 'ليست لديك صلاحية لهذا الإجراء.',
  INVALID_ROLE: 'الدور المختار غير صالح.',
};

const describeError = (message: string) => {
  const key = Object.keys(ERROR_LABEL).find((code) => message.includes(code));
  return key ? ERROR_LABEL[key] : 'تعذر تنفيذ العملية. حاول مرة أخرى.';
};

export default function StaffAccountsPage() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<Role>('editor');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('list_staff_accounts');
    if (error || !Array.isArray(data)) {
      setLoadError('تعذر تحميل حسابات الإدارة.');
      setLoading(false);
      return;
    }
    setLoadError(null);
    setRows(data as StaffRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, okText: string) => {
    setBusy(true);
    setNotice(null);
    const { error } = await fn();
    setBusy(false);
    if (error) {
      setNotice({ tone: 'error', text: describeError(error.message) });
      return;
    }
    setNotice({ tone: 'ok', text: okText });
    await load();
  };

  const grant = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@')) {
      setNotice({ tone: 'error', text: 'أدخل بريداً إلكترونياً صحيحاً.' });
      return;
    }
    void run(() => supabase.rpc('grant_staff_role', { p_email: trimmed, p_role: newRole }), 'تم منح الصلاحية بنجاح.').then(() => setEmail(''));
  };

  const changeRole = (row: StaffRow, role: Role) => {
    if (role === row.role) return;
    void run(() => supabase.rpc('change_staff_role', { p_user: row.user_id, p_role: role }), 'تم تحديث الدور.');
  };

  const remove = (row: StaffRow) => {
    if (!window.confirm(`سحب صلاحيات الإدارة من ${row.email}؟`)) return;
    void run(() => supabase.rpc('change_staff_role', { p_user: row.user_id, p_role: 'none' }), 'تم سحب الصلاحيات.');
  };

  return (
    <main className="min-h-screen bg-sand px-4 py-10 dark:bg-navy sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="eyebrow">المدير الأعلى</span>
            <h1 className="mt-3 flex items-center gap-3 text-3xl font-black text-navy dark:text-white">
              <ShieldCheck className="text-gold" size={30} /> حسابات الإدارة والصلاحيات
            </h1>
          </div>
          <Link to="/admin/dashboard" className="soft-button">
            العودة إلى لوحة التحكم <ArrowRight size={16} />
          </Link>
        </header>

        <section className="soft-card p-6">
          <h2 className="flex items-center gap-2 text-lg font-black text-navy dark:text-white">
            <UserPlus size={20} /> منح صلاحية لحساب
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">يجب أن يكون الشخص قد أنشأ حساباً وأكد بريده الإلكتروني أولاً.</p>
          <form onSubmit={grant} className="mt-5 grid gap-4 md:grid-cols-[1fr_200px_auto] md:items-end">
            <div>
              <label htmlFor="staff-email" className="label">البريد الإلكتروني</label>
              <input id="staff-email" type="email" dir="ltr" className="input mt-2" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="staff-role" className="label">الدور</label>
              <select id="staff-role" className="input mt-2" value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
                {ROLES.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
              </select>
            </div>
            <button type="submit" disabled={busy} className="blue-button justify-center disabled:opacity-60">إضافة</button>
          </form>
        </section>

        {notice && (
          <p role={notice.tone === 'error' ? 'alert' : 'status'} className={notice.tone === 'error' ? 'error-text' : 'text-sm font-bold text-teal'}>
            {notice.text}
          </p>
        )}

        <section className="soft-card overflow-hidden">
          {loading && <p role="status" className="p-6 text-center text-muted">جارٍ التحميل...</p>}
          {!loading && loadError && (
            <div className="flex items-center justify-between gap-4 p-6">
              <p role="alert" className="error-text">{loadError}</p>
              <button onClick={() => void load()} className="soft-button">إعادة المحاولة</button>
            </div>
          )}
          {!loading && !loadError && rows.length === 0 && <p className="p-6 text-center text-muted">لا توجد حسابات إدارة بعد.</p>}
          {!loading && !loadError && rows.length > 0 && (
            <ul className="divide-y divide-navy/10 dark:divide-white/10">
              {rows.map((row) => (
                <li key={row.user_id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div className="min-w-0">
                    <p className="font-black text-navy dark:text-white">{row.display_name ?? 'بدون اسم'}</p>
                    <p dir="ltr" className="truncate text-sm text-muted">{row.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      aria-label="تغيير الدور"
                      className="input py-2"
                      value={row.role}
                      disabled={busy}
                      onChange={(e) => changeRole(row, e.target.value as Role)}
                    >
                      {ROLES.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
                    </select>
                    <button onClick={() => remove(row)} disabled={busy} className="icon-button text-error disabled:opacity-60" aria-label="سحب الصلاحيات">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

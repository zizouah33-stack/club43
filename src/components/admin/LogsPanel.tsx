import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type EmailLogRow = { id: string; recipient: string; email_type: string; subject: string; status: 'sent' | 'failed'; error: string | null; created_at: string };
type AuditRow = { id: string; action: string; target_type: string; target_id: string; details: Record<string, unknown>; created_at: string };

type LogKind = 'email' | 'audit';

const EMAIL_TYPE_LABEL: Record<string, string> = { application_received: 'استلام الطلب', approval: 'قبول', rejection: 'رفض' };
const ACTION_LABEL: Record<string, string> = {
  approve_application: 'قبول طلب',
  reject_application: 'رفض طلب',
  member_suspend: 'إيقاف عضو',
  member_reactivate: 'إعادة تفعيل عضو',
  member_expel: 'طرد عضو',
  member_reset_password: 'إعادة تعيين كلمة السر',
};
const LIMIT = 50;

export default function LogsPanel({ kind }: { kind: LogKind }) {
  const [emailRows, setEmailRows] = useState<EmailLogRow[]>([]);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    const request =
      kind === 'email'
        ? supabase.from('email_logs').select('id, recipient, email_type, subject, status, error, created_at').order('created_at', { ascending: false }).limit(LIMIT)
        : supabase.from('audit_log').select('id, action, target_type, target_id, details, created_at').order('created_at', { ascending: false }).limit(LIMIT);
    request.then(({ data, error: queryError }) => {
      if (!active) return;
      setLoading(false);
      if (queryError) {
        setError('تعذر تحميل السجل. حاول مرة أخرى.');
        return;
      }
      setError('');
      if (kind === 'email') setEmailRows((data as EmailLogRow[] | null) ?? []);
      else setAuditRows((data as AuditRow[] | null) ?? []);
    });
    return () => {
      active = false;
    };
  }, [kind]);

  if (loading) return <div className="h-40 animate-pulse rounded-2xl bg-navy/5 dark:bg-white/5" />;
  if (error) return <p role="alert" className="rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-700">{error}</p>;

  if (kind === 'email') {
    if (emailRows.length === 0) return <p className="soft-card p-8 text-center text-sm text-muted">لم تُسجل أي رسالة بريد بعد.</p>;
    return (
      <div className="soft-card overflow-x-auto">
        <table className="w-full text-start text-sm">
          <thead className="bg-navy/5 text-xs text-muted dark:bg-white/5">
            <tr>
              <th className="p-4 font-bold">التاريخ</th>
              <th className="p-4 font-bold">النوع</th>
              <th className="p-4 font-bold">المستلم</th>
              <th className="p-4 font-bold">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {emailRows.map((row) => (
              <tr key={row.id} className="border-t border-navy/10 dark:border-white/10">
                <td className="p-4 text-muted">{new Date(row.created_at).toLocaleString('ar-DZ')}</td>
                <td className="p-4 font-bold text-navy dark:text-white">{EMAIL_TYPE_LABEL[row.email_type] ?? row.email_type}</td>
                <td className="p-4 text-muted" dir="ltr">{row.recipient}</td>
                <td className="p-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${row.status === 'sent' ? 'bg-teal/15 text-teal' : 'bg-red-500/10 text-red-700'}`}>
                    {row.status === 'sent' ? 'أُرسل' : 'فشل'}
                  </span>
                  {row.error && <p className="mt-1 text-xs text-muted">{row.error}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (auditRows.length === 0) return <p className="soft-card p-8 text-center text-sm text-muted">لا توجد إجراءات مسجلة بعد.</p>;
  return (
    <ul className="soft-card divide-y divide-navy/10 dark:divide-white/10">
      {auditRows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
          <span className="font-bold text-navy dark:text-white">{ACTION_LABEL[row.action] ?? row.action}</span>
          <span className="text-muted" dir="ltr">{typeof row.details.membership_number === 'string' ? row.details.membership_number : ''}</span>
          <span className="text-xs text-muted">{new Date(row.created_at).toLocaleString('ar-DZ')}</span>
        </li>
      ))}
    </ul>
  );
}

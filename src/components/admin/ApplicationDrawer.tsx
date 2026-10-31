import { useEffect, useState } from 'react';
import { Check, RefreshCw, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { invokeAdminFunction } from '@/lib/edgeFunctions';
import { ageFromIso } from '@/features/membership/schema';
import { STATUS_BADGE, STATUS_LABEL, type Application } from '@/features/membership/types';

type Props = {
  application: Application;
  busy: boolean;
  onClose: () => void;
  onApprove: (application: Application) => void;
  onReject: (application: Application) => void;
};

const GENDER_LABEL: Record<string, string> = { male: 'ذكر', female: 'أنثى' };

type DecisionEmail = { email_type: 'approval' | 'rejection'; status: 'sent' | 'failed'; created_at: string };

export default function ApplicationDrawer({ application, busy, onClose, onApprove, onReject }: Props) {
  const [decisionEmail, setDecisionEmail] = useState<DecisionEmail | null>(null);
  const [emailNote, setEmailNote] = useState('');
  const [resending, setResending] = useState(false);
  const [emailRefresh, setEmailRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    supabase
      .from('email_logs')
      .select('email_type, status, created_at')
      .eq('application_id', application.id)
      .in('email_type', ['approval', 'rejection'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (active && !error) setDecisionEmail(data as DecisionEmail | null);
      });
    return () => {
      active = false;
    };
  }, [application.id, emailRefresh]);

  const resend = async () => {
    if (!decisionEmail) return;
    setResending(true);
    setEmailNote('');
    const result = await invokeAdminFunction<{ status?: string }>('send-email', {
      type: decisionEmail.email_type,
      application_id: application.id,
    });
    setResending(false);
    if (result.errorMessage) {
      setEmailNote(result.errorMessage);
      return;
    }
    setEmailNote(result.data?.status === 'sent' ? 'تم إرسال البريد بنجاح.' : 'ما زال إرسال البريد متعذراً. تحقق من إعدادات البريد.');
    setEmailRefresh((value) => value + 1);
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const age = application.birth_date ? ageFromIso(application.birth_date) : null;
  const rows: [string, string][] = [
    ['البريد الإلكتروني', application.email],
    ['الهاتف', application.phone],
    ['تاريخ الميلاد', application.birth_date ? `${application.birth_date} (${age} سنة)` : '—'],
    ['الجنس', GENDER_LABEL[application.gender ?? ''] ?? '—'],
    ['البلدية / العنوان', application.address],
    ['المستوى الدراسي أو المهنة', application.education_or_job],
    ['الاهتمامات', application.interests.join('، ') || '—'],
    ['تاريخ الطلب', new Date(application.created_at).toLocaleString('ar-DZ')],
    ['رقم العضوية', application.membership_number ?? '—'],
  ];
  const isMinor = age !== null && age < 18;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-navy/40 backdrop-blur-sm" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="application-title"
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col bg-sand shadow-2xl dark:bg-[#102b4c]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-navy/10 p-5 dark:border-white/10">
          <div>
            <h2 id="application-title" className="text-xl font-black text-navy dark:text-white">
              {application.first_name ?? application.full_name} {application.last_name ?? ''}
            </h2>
            <span className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-bold ${STATUS_BADGE[application.status]}`}>
              {STATUS_LABEL[application.status]}
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="icon-button shrink-0">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <dl className="grid gap-4">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-bold text-muted">{label}</dt>
                <dd className="mt-1 break-words text-sm font-semibold text-navy dark:text-white" dir={label === 'البريد الإلكتروني' || label === 'الهاتف' ? 'ltr' : undefined}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <div>
            <h3 className="text-xs font-bold text-muted">الدافع</h3>
            <p className="mt-2 whitespace-pre-line rounded-2xl bg-white p-4 text-sm leading-7 text-navy dark:bg-white/5 dark:text-white">
              {application.motivation}
            </p>
          </div>

          {isMinor && (
            <div className="rounded-2xl border border-gold/50 bg-gold/10 p-4">
              <h3 className="font-black text-navy dark:text-white">موافقة ولي الأمر</h3>
              <dl className="mt-3 grid gap-3 text-sm text-navy dark:text-white">
                <div><dt className="text-xs font-bold text-muted">اسم ولي الأمر</dt><dd className="font-semibold">{application.guardian_name ?? '—'}</dd></div>
                <div><dt className="text-xs font-bold text-muted">هاتف ولي الأمر</dt><dd className="font-semibold" dir="ltr">{application.guardian_phone ?? '—'}</dd></div>
                <div><dt className="text-xs font-bold text-muted">الموافقة</dt><dd className="font-semibold">{application.guardian_consent ? 'موافق' : 'غير موافق'}</dd></div>
              </dl>
            </div>
          )}

          <div>
            <h3 className="text-xs font-bold text-muted">بريد القرار</h3>
            {decisionEmail ? (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl bg-white p-4 text-sm dark:bg-white/5">
                <span className="font-bold text-navy dark:text-white">
                  {decisionEmail.status === 'sent' ? 'أُرسل بنجاح' : 'فشل الإرسال'}
                </span>
                {decisionEmail.status === 'failed' && (
                  <button type="button" disabled={resending} onClick={() => void resend()} className="soft-button min-h-10 px-3 disabled:opacity-60">
                    <RefreshCw size={14} /> إعادة الإرسال
                  </button>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">لم يُرسل أي بريد للقرار بعد.</p>
            )}
            {emailNote && <p role="status" className="mt-2 text-sm text-navy dark:text-white">{emailNote}</p>}
          </div>

          {application.status === 'rejected' && application.rejection_reason && (
            <div className="rounded-2xl bg-red-500/10 p-4 text-sm leading-7 text-red-800">
              <span className="font-bold">سبب الرفض: </span>
              {application.rejection_reason}
            </div>
          )}
        </div>

        {application.status === 'pending' && (
          <footer className="grid grid-cols-2 gap-3 border-t border-navy/10 p-5 dark:border-white/10">
            <button type="button" disabled={busy} onClick={() => onReject(application)} className="soft-button min-h-11 justify-center text-red-700 disabled:opacity-60">
              <X size={16} /> رفض
            </button>
            <button type="button" disabled={busy} onClick={() => onApprove(application)} className="blue-button min-h-11 justify-center disabled:opacity-60">
              <Check size={16} /> قبول
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}

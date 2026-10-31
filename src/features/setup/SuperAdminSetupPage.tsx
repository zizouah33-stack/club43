import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type Phase = 'loading' | 'ready' | 'completed' | 'done';

const MIN_LENGTH = 12;
const ADMIN_EMAIL = 'ahraouziad6@gmail.com';

const ERROR_TEXT: Record<number, string> = {
  400: `كلمة السر يجب أن تكون ${MIN_LENGTH} حرفاً على الأقل، وتأكد من تعبئة الحقول.`,
  401: 'رمز التفعيل غير صحيح.',
  410: 'تم الإعداد مسبقاً، ولا يمكن تكراره.',
};

export default function SuperAdminSetupPage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.rpc('setup_status').then(({ data, error: statusError }) => {
      if (!active) return;
      if (statusError) setError('تعذر التحقق من حالة الإعداد. حاول مرة أخرى.');
      setPhase(data === true ? 'completed' : 'ready');
    });
    return () => { active = false; };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_LENGTH) {
      setError(ERROR_TEXT[400]);
      return;
    }
    if (password !== confirm) {
      setError('كلمتا السر غير متطابقتين.');
      return;
    }
    setSaving(true);
    const { error: invokeError } = await supabase.functions.invoke('setup-super-admin', {
      body: { bootstrap_token: token.trim(), password },
    });
    setSaving(false);
    setPassword('');
    setConfirm('');
    if (!invokeError) {
      setToken('');
      setPhase('done');
      return;
    }
    const status = invokeError instanceof FunctionsHttpError ? invokeError.context.status : 0;
    if (status === 410) setPhase('completed');
    setError(ERROR_TEXT[status] ?? 'تعذر إنشاء الحساب. تحقق من الاتصال وحاول مرة أخرى.');
  };

  return (
    <main className="min-h-screen bg-sand px-4 py-16 dark:bg-navy sm:px-8">
      <div className="mx-auto max-w-md rounded-[2rem] border border-navy/10 bg-white p-8 shadow-xl dark:border-white/10 dark:bg-[#102b4c]">
        {phase === 'loading' && (
          <div className="flex flex-col items-center gap-4 py-10" role="status">
            <Loader2 className="animate-spin text-blue" size={36} />
            <p className="font-bold text-navy dark:text-white">جارٍ التحقق من حالة الإعداد...</p>
          </div>
        )}

        {phase === 'completed' && (
          <div className="space-y-5 text-center">
            <ShieldCheck className="mx-auto text-teal" size={52} />
            <h1 className="text-2xl font-black text-navy dark:text-white">تم إعداد المنصة مسبقاً</h1>
            <p className="text-sm leading-7 text-muted">هذه الصفحة أُغلقت نهائياً. يمكن للمدير الدخول من صفحة تسجيل الدخول.</p>
            <Link to="/login" className="blue-button inline-flex">الذهاب إلى تسجيل الدخول</Link>
          </div>
        )}

        {phase === 'done' && (
          <div className="space-y-5 text-center">
            <CheckCircle2 className="mx-auto text-teal" size={52} />
            <h1 className="text-2xl font-black text-navy dark:text-white">تم إنشاء حساب مدير المنصة</h1>
            <p className="text-sm leading-7 text-muted">
              تم إنشاء حساب {ADMIN_EMAIL} بصلاحية المدير الأعلى. يمكنك الآن تسجيل الدخول والوصول إلى لوحة الإدارة.
            </p>
            <Link to="/login" className="blue-button inline-flex">تسجيل الدخول</Link>
          </div>
        )}

        {phase === 'ready' && (
          <form onSubmit={submit} className="space-y-5">
            <div className="text-center">
              <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15 text-gold">
                <LockKeyhole size={26} />
              </span>
              <h1 className="text-2xl font-black text-navy dark:text-white">الإعداد الأولي لمدير المنصة</h1>
              <p className="mt-3 text-sm leading-7 text-muted">
                هذه الصفحة تُستخدم مرة واحدة فقط لإنشاء حساب المدير الأعلى للمنصة. بعد النجاح تُغلق نهائياً.
              </p>
            </div>

            <div className="rounded-2xl bg-blue/10 p-4 text-sm font-bold text-blue" dir="ltr">{ADMIN_EMAIL}</div>

            <div>
              <label htmlFor="bootstrap-token" className="label">رمز التفعيل لمرة واحدة</label>
              <input id="bootstrap-token" type="password" autoComplete="off" className="input mt-2" value={token} onChange={(e) => setToken(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="setup-password" className="label">كلمة السر الأولية</label>
              <input id="setup-password" type="password" autoComplete="new-password" className="input mt-2" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="setup-confirm" className="label">تأكيد كلمة السر</label>
              <input id="setup-confirm" type="password" autoComplete="new-password" className="input mt-2" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>

            <p className="text-xs leading-6 text-muted">
              تُرسل البيانات عبر اتصال مشفّر إلى الخادم، وتُحفظ كلمة السر مشفّرة في نظام المصادقة فقط. لا تُحفظ في المتصفح أو السجلات.
            </p>

            {error && <p role="alert" className="error-text">{error}</p>}

            <button type="submit" disabled={saving} className="blue-button w-full justify-center disabled:opacity-60">
              {saving ? 'جارٍ الإنشاء...' : 'إنشاء حساب المدير'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

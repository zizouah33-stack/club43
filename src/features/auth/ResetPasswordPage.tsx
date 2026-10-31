import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Phase = 'checking' | 'ready' | 'invalid' | 'done';

const MIN_LENGTH = 8;

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const markReady = () => { if (active) setPhase('ready'); };

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) markReady();
      else setTimeout(() => { if (active) setPhase((current) => (current === 'checking' ? 'invalid' : current)); }, 1500);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') markReady();
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_LENGTH) {
      setError(`كلمة السر يجب أن تكون ${MIN_LENGTH} أحرف على الأقل.`);
      return;
    }
    if (password !== confirm) {
      setError('كلمتا السر غير متطابقتين.');
      return;
    }
    setSaving(true);
    const { data: userData, error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError || !userData.user) {
      setSaving(false);
      setError('تعذر تحديث كلمة السر. ربما انتهت صلاحية الرابط، اطلب رابطاً جديداً.');
      return;
    }
    await supabase.from('members').update({ must_change_password: false }).eq('id', userData.user.id);
    await supabase.auth.signOut();
    setSaving(false);
    setPhase('done');
    setTimeout(() => navigate('/login', { replace: true }), 2500);
  };

  return (
    <main className="min-h-screen bg-sand px-4 py-16 dark:bg-navy sm:px-8">
      <div className="mx-auto max-w-md rounded-[2rem] border border-navy/10 bg-white p-8 shadow-xl dark:border-white/10 dark:bg-[#102b4c]">
        {phase === 'checking' && (
          <div className="flex flex-col items-center gap-4 py-10 text-center" role="status">
            <Loader2 className="animate-spin text-blue" size={36} />
            <p className="font-bold text-navy dark:text-white">جارٍ التحقق من الرابط...</p>
          </div>
        )}

        {phase === 'invalid' && (
          <div className="space-y-5 text-center">
            <h1 className="text-2xl font-black text-navy dark:text-white">الرابط غير صالح أو منتهي</h1>
            <p className="text-sm leading-7 text-muted">اطلب رابط استعادة جديداً من صفحة تسجيل الدخول.</p>
            <Link to="/login" className="blue-button inline-flex">العودة إلى تسجيل الدخول</Link>
          </div>
        )}

        {phase === 'done' && (
          <div className="space-y-4 py-6 text-center">
            <CheckCircle2 className="mx-auto text-teal" size={52} />
            <h1 className="text-2xl font-black text-navy dark:text-white">تم تحديث كلمة السر</h1>
            <p className="text-sm leading-7 text-muted">سيتم تحويلك إلى صفحة تسجيل الدخول.</p>
          </div>
        )}

        {phase === 'ready' && (
          <form onSubmit={submit} className="space-y-5">
            <div className="text-center">
              <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15 text-gold">
                <KeyRound size={26} />
              </span>
              <h1 className="text-2xl font-black text-navy dark:text-white">تعيين كلمة سر جديدة</h1>
              <p className="mt-2 text-sm text-muted">اختر كلمة سر لا تقل عن {MIN_LENGTH} أحرف.</p>
            </div>
            <div>
              <label htmlFor="new-password" className="label">كلمة السر الجديدة</label>
              <input id="new-password" type="password" autoComplete="new-password" className="input mt-2" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="confirm-password" className="label">تأكيد كلمة السر</label>
              <input id="confirm-password" type="password" autoComplete="new-password" className="input mt-2" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            {error && <p role="alert" className="error-text">{error}</p>}
            <button type="submit" disabled={saving} className="blue-button w-full justify-center disabled:opacity-60">
              {saving ? 'جارٍ الحفظ...' : 'حفظ كلمة السر'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

import { useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

const MIN_LENGTH = 12;

export default function AdminAccountPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_LENGTH) {
      setError(`كلمة السر يجب أن تكون ${MIN_LENGTH} حرفاً على الأقل.`);
      return;
    }
    if (password !== confirm) {
      setError('كلمتا السر غير متطابقتين.');
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    setPassword('');
    setConfirm('');
    if (updateError) {
      setError('تعذر تغيير كلمة السر. حاول مرة أخرى.');
      return;
    }
    setSaved(true);
  };

  return (
    <main className="min-h-screen bg-sand px-4 py-8 dark:bg-navy sm:px-8">
      <div className="mx-auto max-w-md">
        <button type="button" onClick={() => navigate('/admin/dashboard')} className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-blue">
          <ArrowRight size={16} /> العودة إلى لوحة الإدارة
        </button>
        <div className="soft-card space-y-5 p-8">
          <h1 className="text-2xl font-black text-navy dark:text-white">إعدادات الحساب</h1>
          <p className="text-sm leading-7 text-muted">يمكنك تغيير كلمة السر في أي وقت.</p>
          {saved ? (
            <p role="status" className="rounded-2xl bg-teal/10 p-4 text-sm font-bold text-teal">تم تغيير كلمة السر بنجاح.</p>
          ) : (
            <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
              <label className="block">
                <span className="label">كلمة السر الجديدة</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" dir="ltr" className="input mt-2" required />
              </label>
              <label className="block">
                <span className="label">تأكيد كلمة السر الجديدة</span>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" dir="ltr" className="input mt-2" required />
              </label>
              {error && <p role="alert" className="error-text">{error}</p>}
              <button type="submit" disabled={saving} className="blue-button w-full justify-center disabled:opacity-60">
                {saving ? 'جارٍ الحفظ...' : 'تغيير كلمة السر'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import type { Member } from '@/features/account/types';

type Props = {
  member: Member;
  forced: boolean;
  onChanged: () => void;
};

const MIN_LENGTH = 8;

export default function PasswordForm({ member, forced, onChanged }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (next.length < MIN_LENGTH) return setError(`كلمة السر الجديدة يجب أن تكون ${MIN_LENGTH} أحرف على الأقل.`);
    if (next !== confirm) return setError('كلمتا السر غير متطابقتين.');
    if (next === current) return setError('اختر كلمة سر مختلفة عن الحالية.');

    setBusy(true);
    const email = `${member.membership_number.toLowerCase()}@members.elmassar.internal`;
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: current });
    if (verifyError) {
      setBusy(false);
      return setError('كلمة السر الحالية غير صحيحة.');
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: next });
    if (updateError) {
      setBusy(false);
      return setError('تعذر تغيير كلمة السر. حاول مرة أخرى.');
    }

    const { error: flagError } = await supabase.from('members').update({ must_change_password: false }).eq('id', member.id);
    setBusy(false);
    if (flagError) return setError('تم تغيير كلمة السر، لكن تعذر تحديث الحساب. حاول مرة أخرى.');
    setSaved(true);
    onChanged();
  };

  if (saved) {
    return (
      <p role="status" className="rounded-2xl bg-teal/10 p-4 text-sm font-bold text-teal">
        تم تغيير كلمة السر بنجاح.
      </p>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
      {forced && (
        <p className="rounded-2xl bg-gold/15 p-4 text-sm leading-6 text-navy dark:text-white">
          هذه أول مرة تدخل فيها بحسابك. يرجى تغيير كلمة السر الأولية قبل المتابعة.
        </p>
      )}
      <label className="block">
        <span className="label">كلمة السر الحالية</span>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" dir="ltr" className="input mt-2" required />
      </label>
      <label className="block">
        <span className="label">كلمة السر الجديدة</span>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" dir="ltr" className="input mt-2" required />
      </label>
      <label className="block">
        <span className="label">تأكيد كلمة السر الجديدة</span>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" dir="ltr" className="input mt-2" required />
      </label>
      {error && <p role="alert" className="error-text">{error}</p>}
      <button type="submit" disabled={busy} className="blue-button w-full justify-center disabled:opacity-60">
        {busy ? 'جارٍ الحفظ...' : 'تغيير كلمة السر'}
      </button>
    </form>
  );
}

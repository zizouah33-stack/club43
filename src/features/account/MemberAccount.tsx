import { useCallback, useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import MembershipCard from '@/features/account/MembershipCard';
import ProfileForm from '@/features/account/ProfileForm';
import PasswordForm from '@/features/account/PasswordForm';
import { MEMBER_COLUMNS, type Member } from '@/features/account/types';

export default function MemberAccount() {
  const navigate = useNavigate();
  const [member, setMember] = useState<Member | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const { data, error: loadError } = await supabase.from('members').select(MEMBER_COLUMNS).maybeSingle();
    if (loadError) {
      setError('تعذر تحميل بيانات حسابك. حاول مرة أخرى.');
      setLoading(false);
      return;
    }
    const row = data as Member | null;
    setMember(row);
    if (row?.photo_url) {
      const { data: signed } = await supabase.storage.from('member-photos').createSignedUrl(row.photo_url, 3600);
      setPhotoUrl(signed?.signedUrl ?? null);
    } else {
      setPhotoUrl(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const logout = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-sand dark:bg-navy">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-navy/15 border-t-blue" role="status" aria-label="جارٍ التحميل" />
      </main>
    );
  }

  if (error || !member) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-sand px-4 dark:bg-navy">
        <div className="soft-card max-w-md space-y-4 p-8 text-center">
          <p className="font-black text-navy dark:text-white">{error || 'لا يمكن الوصول إلى هذا الحساب. تواصل مع الإدارة.'}</p>
          <button type="button" onClick={() => void logout()} className="soft-button">تسجيل الخروج</button>
        </div>
      </main>
    );
  }

  const firstName = member.full_name.split(' ')[0];

  return (
    <main className="min-h-screen bg-sand px-4 py-8 dark:bg-navy sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-blue">حسابي</p>
            <h1 className="text-2xl font-black text-navy dark:text-white">مرحباً {firstName}</h1>
          </div>
          <button type="button" onClick={() => void logout()} className="soft-button min-h-11">
            <LogOut size={16} /> تسجيل الخروج
          </button>
        </header>

        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <MembershipCard member={member} photoUrl={photoUrl} />
          <div className="soft-card p-6 sm:p-8">
            <ProfileForm member={member} photoUrl={photoUrl} onSaved={() => void load()} />
          </div>
        </div>

        <section className="soft-card max-w-xl p-6 sm:p-8">
          <h2 className="mb-6 text-lg font-black text-navy dark:text-white">تغيير كلمة السر</h2>
          <PasswordForm member={member} forced={false} onChanged={() => void load()} />
        </section>
      </div>

      {member.must_change_password && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-navy/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="forced-password-title">
          <div className="soft-card w-full max-w-md space-y-5 p-6 sm:p-8">
            <h2 id="forced-password-title" className="text-xl font-black text-navy dark:text-white">تغيير كلمة السر مطلوب</h2>
            <PasswordForm member={member} forced onChanged={() => void load()} />
          </div>
        </div>
      )}
    </main>
  );
}

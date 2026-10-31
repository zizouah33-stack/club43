import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LogIn } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

const MEMBER_EMAIL_DOMAIN = 'members.elmassar.internal';
const MEMBERSHIP_NUMBER = /^EM-\d{4}-\d{3}$/;
const GENERIC_FAILURE = 'بيانات الدخول غير صحيحة. تحقق منها وحاول مرة أخرى.';
const BLOCKED = 'لا يمكن الوصول إلى هذا الحساب. تواصل مع الإدارة.';
const DELAY_AFTER = 3;
const DELAY_SECONDS = 5;

function memberEmail(number: string) {
  return `${number.toLowerCase()}@${MEMBER_EMAIL_DOMAIN}`;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failures, setFailures] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [resetNotice, setResetNotice] = useState('');

  const fail = (message: string) => {
    const next = failures + 1;
    setFailures(next);
    setError(message);
    if (next >= DELAY_AFTER) {
      setCooldown(DELAY_SECONDS);
      const timer = window.setInterval(() => {
        setCooldown((value) => {
          if (value <= 1) window.clearInterval(timer);
          return Math.max(0, value - 1);
        });
      }, 1000);
    }
  };

  const signInAdmin = async (email: string, secret: string) => {
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: secret });
    if (signInError) return fail(GENERIC_FAILURE);
    const { data: role, error: claimError } = await supabase.rpc('claim_admin_role');
    if (claimError || !role) {
      await supabase.auth.signOut();
      return fail(GENERIC_FAILURE);
    }
    setFailures(0);
    navigate(role === 'editor' ? '/admin/content' : '/admin', { replace: true });
  };

  const signInMember = async (number: string, secret: string) => {
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: memberEmail(number), password: secret });
    if (signInError) return fail(GENERIC_FAILURE);
    const { data: member, error: memberError } = await supabase.from('members').select('id').maybeSingle();
    if (memberError || !member) {
      await supabase.auth.signOut();
      return fail(memberError ? GENERIC_FAILURE : BLOCKED);
    }
    setFailures(0);
    navigate('/account', { replace: true });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || cooldown > 0) return;
    setError('');
    setResetNotice('');

    const trimmed = identifier.trim();
    const secret = trimmed.includes('@') ? password : password.replace(/[/\-.\s]/g, '');
    if (!trimmed || !secret) return setError('أدخل رقم العضوية أو البريد الإلكتروني، وكلمة السر.');

    setSubmitting(true);
    try {
      if (trimmed.includes('@')) {
        await signInAdmin(trimmed.toLowerCase(), secret);
      } else {
        const number = trimmed.toUpperCase();
        if (!MEMBERSHIP_NUMBER.test(number)) return fail(GENERIC_FAILURE);
        await signInMember(number, secret);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const forgotPassword = async () => {
    const trimmed = identifier.trim();
    if (!trimmed.includes('@')) {
      setResetNotice('تواصل مع الإدارة لإعادة تعيين كلمة السر.');
      return;
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed.toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetNotice(resetError ? 'تعذر إرسال رابط الاستعادة. حاول مرة أخرى.' : 'إذا كان البريد مسجلاً، ستصلك رسالة لإعادة تعيين كلمة السر.');
  };

  return (
    <main className="min-h-screen bg-sand px-4 py-10 dark:bg-navy sm:px-8">
      <div className="mx-auto max-w-md">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-blue">
          <ArrowRight size={16} /> العودة إلى الرئيسية
        </Link>

        <div className="soft-card mt-6 space-y-6 p-7 sm:p-8">
          <div>
            <h1 className="text-2xl font-black text-navy dark:text-white">تسجيل الدخول</h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              المنخرطون: رقم العضوية وتاريخ الميلاد. الفريق الإداري: البريد الإلكتروني وكلمة السر.
            </p>
          </div>

          <form onSubmit={(event) => void submit(event)} noValidate className="space-y-5">
            <label className="block">
              <span className="label">رقم العضوية أو البريد الإلكتروني</span>
              <input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                autoComplete="username"
                dir="ltr"
                placeholder="EM-2026-001"
                className="input mt-2"
                required
              />
            </label>

            <label className="block">
              <span className="label">كلمة السر</span>
              <span className="relative mt-2 block">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  dir="ltr"
                  placeholder="تاريخ الميلاد مثل 09022006"
                  className="input pe-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
                  className="absolute end-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted transition hover:bg-navy/5 hover:text-navy dark:hover:bg-white/10 dark:hover:text-white"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>

            {error && <p role="alert" className="error-text">{error}</p>}
            {cooldown > 0 && (
              <p role="status" className="text-sm font-bold text-navy dark:text-white">
                يرجى الانتظار {cooldown} ثوانٍ قبل المحاولة مجدداً.
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || cooldown > 0}
              className="blue-button w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogIn size={16} /> {submitting ? 'جارٍ التحقق...' : 'دخول'}
            </button>
          </form>

          <div className="space-y-2 border-t border-navy/10 pt-5 text-sm dark:border-white/10">
            <button type="button" onClick={() => void forgotPassword()} className="font-bold text-blue">
              نسيت كلمة السر؟
            </button>
            {resetNotice && <p className="text-muted">{resetNotice}</p>}
          </div>
        </div>
      </div>
    </main>
  );
}

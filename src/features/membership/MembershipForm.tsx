import { useState, type FormEvent, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Check, Loader2, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import {
  INTERESTS,
  MONTHS,
  ageFromIso,
  membershipSchema,
  toIsoDate,
  type MembershipValues,
} from '@/features/membership/schema';

type StepField = keyof MembershipValues;

const STEPS: { title: string; fields: StepField[] }[] = [
  {
    title: 'الهوية',
    fields: ['first_name', 'last_name', 'birth_day', 'birth_month', 'birth_year', 'gender'],
  },
  {
    title: 'التواصل',
    fields: ['phone', 'email', 'address', 'education_or_job'],
  },
  {
    title: 'الاهتمامات والموافقات',
    fields: ['interests', 'motivation', 'guardian_name', 'guardian_phone', 'guardian_consent', 'bylaws_accepted'],
  },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 1930 + 1 }, (_, index) => String(currentYear - index));
const DAYS = Array.from({ length: 31 }, (_, index) => String(index + 1));

function mapSubmitError(message: string) {
  if (message.includes('RATE_LIMITED')) return 'لقد أرسلت عدداً كبيراً من الطلبات. حاول لاحقاً.';
  if (message.includes('DUPLICATE_PENDING')) return 'يوجد طلب قيد المراجعة بهذا البريد الإلكتروني.';
  if (message.includes('VALIDATION')) return 'تحقق من البيانات المدخلة ثم أعد المحاولة.';
  return 'تعذر إرسال الطلب. حاول مرة أخرى.';
}

export function MembershipForm() {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);

  const form = useForm<MembershipValues>({
    resolver: zodResolver(membershipSchema),
    defaultValues: {
      interests: [],
      guardian_consent: false,
      bylaws_accepted: false,
      website: '',
    },
  });
  const { errors } = form.formState;
  const isLastStep = step === STEPS.length - 1;
  const birthYear = form.watch('birth_year');
  const birthMonth = form.watch('birth_month');
  const birthDay = form.watch('birth_day');
  const birthIso = toIsoDate(birthYear ?? '', birthMonth ?? '', birthDay ?? '');
  const isMinor = birthIso !== null && ageFromIso(birthIso) < 18;

  const goNext = async () => {
    const valid = await form.trigger(STEPS[step].fields);
    if (valid) setStep((current) => current + 1);
  };

  const submit = async (values: MembershipValues) => {
    setSubmitError('');
    if (values.website) {
      setDone(true);
      return;
    }
    const birthDate = toIsoDate(values.birth_year, values.birth_month, values.birth_day);
    if (!birthDate) return;

    setSubmitting(true);
    const { data: applicationId, error } = await supabase.rpc('submit_membership_application', {
      p_first_name: values.first_name,
      p_last_name: values.last_name,
      p_birth_date: birthDate,
      p_gender: values.gender,
      p_email: values.email,
      p_phone: values.phone,
      p_address: values.address,
      p_education_or_job: values.education_or_job,
      p_interests: values.interests,
      p_motivation: values.motivation,
      p_guardian_name: values.guardian_name || null,
      p_guardian_phone: values.guardian_phone || null,
      p_guardian_consent: values.guardian_consent,
      p_bylaws_accepted: values.bylaws_accepted,
    });
    setSubmitting(false);

    if (error) {
      setSubmitError(mapSubmitError(error.message));
      return;
    }
    if (typeof applicationId === 'string') {
      void supabase.functions.invoke('send-email', { body: { type: 'application_received', application_id: applicationId } });
    }
    setDone(true);
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isLastStep) {
      void goNext();
      return;
    }
    void form.handleSubmit(submit)(event);
  };

  if (done) {
    return (
      <div className="mt-12 max-w-2xl rounded-[2rem] bg-teal/10 p-8 text-center sm:p-10">
        <Check className="mx-auto text-teal" size={52} />
        <h2 className="mt-5 text-2xl font-black text-navy dark:text-white">تم استلام طلبك</h2>
        <p className="mt-3 leading-8 text-navy/80 dark:text-white/80">
          سنراسلك على بريدك الإلكتروني بعد المراجعة.
        </p>
        <Link to="/" className="blue-button mt-7">
          العودة إلى الرئيسية
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleFormSubmit} noValidate className="mt-12 max-w-3xl">
      <ol className="mb-8 grid grid-cols-3 gap-2" aria-label="خطوات الطلب">
        {STEPS.map((item, index) => (
          <li key={item.title} className="space-y-2">
            <div className={`h-1.5 rounded-full transition-colors ${index <= step ? 'bg-blue' : 'bg-navy/15 dark:bg-white/15'}`} />
            <p className={`text-xs font-bold sm:text-sm ${index === step ? 'text-navy dark:text-white' : 'text-muted'}`}>
              {index + 1}. {item.title}
            </p>
          </li>
        ))}
      </ol>

      <div className="soft-card grid gap-5 p-5 sm:grid-cols-2 sm:p-8">
        {step === 0 && (
          <>
            <Field label="الاسم الأول" htmlFor="first_name" error={errors.first_name?.message}>
              <input id="first_name" className="input" autoComplete="given-name" {...form.register('first_name')} />
            </Field>
            <Field label="اللقب" htmlFor="last_name" error={errors.last_name?.message}>
              <input id="last_name" className="input" autoComplete="family-name" {...form.register('last_name')} />
            </Field>
            <div className="sm:col-span-2">
              <span className="label">تاريخ الميلاد</span>
              <div className="mt-2 grid grid-cols-3 gap-3">
                <select aria-label="يوم الميلاد" className="input" {...form.register('birth_day')}>
                  <option value="">اليوم</option>
                  {DAYS.map((day) => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
                <select aria-label="شهر الميلاد" className="input" {...form.register('birth_month')}>
                  <option value="">الشهر</option>
                  {MONTHS.map((month, index) => (
                    <option key={month} value={String(index + 1)}>{month}</option>
                  ))}
                </select>
                <select aria-label="سنة الميلاد" className="input" {...form.register('birth_year')}>
                  <option value="">السنة</option>
                  {YEARS.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              {(errors.birth_day || errors.birth_month || errors.birth_year) && (
                <p className="error-text">{errors.birth_day?.message ?? errors.birth_month?.message ?? errors.birth_year?.message}</p>
              )}
            </div>
            <div className="sm:col-span-2">
              <span className="label">الجنس</span>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <label className="soft-card flex min-h-11 cursor-pointer items-center justify-center gap-2 p-3 font-bold text-navy has-[:checked]:border-blue has-[:checked]:bg-blue/10 dark:text-white">
                  <input type="radio" value="male" className="accent-blue" {...form.register('gender')} /> ذكر
                </label>
                <label className="soft-card flex min-h-11 cursor-pointer items-center justify-center gap-2 p-3 font-bold text-navy has-[:checked]:border-blue has-[:checked]:bg-blue/10 dark:text-white">
                  <input type="radio" value="female" className="accent-blue" {...form.register('gender')} /> أنثى
                </label>
              </div>
              {errors.gender && <p className="error-text">{errors.gender.message}</p>}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <Field label="رقم الهاتف" htmlFor="phone" error={errors.phone?.message}>
              <input id="phone" type="tel" dir="ltr" className="input" autoComplete="tel" {...form.register('phone')} />
            </Field>
            <Field label="البريد الإلكتروني الحقيقي" htmlFor="email" error={errors.email?.message}>
              <input id="email" type="email" dir="ltr" className="input" autoComplete="email" {...form.register('email')} />
            </Field>
            <p className="text-sm leading-7 text-muted sm:col-span-2">
              سنرسل إلى هذا البريد تأكيد استلام الطلب ونتيجة المراجعة، لذلك يجب أن يكون بريداً تستخدمه فعلياً.
            </p>
            <Field label="البلدية أو العنوان" htmlFor="address" error={errors.address?.message}>
              <input id="address" className="input" autoComplete="address-level2" {...form.register('address')} />
            </Field>
            <Field label="المستوى الدراسي أو المهنة" htmlFor="education_or_job" error={errors.education_or_job?.message}>
              <input id="education_or_job" className="input" {...form.register('education_or_job')} />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <div className="sm:col-span-2">
              <span className="label">مجالات الاهتمام</span>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {INTERESTS.map((interest) => (
                  <label key={interest} className="soft-card flex min-h-11 cursor-pointer items-center justify-center gap-2 p-3 text-sm font-bold text-navy has-[:checked]:border-blue has-[:checked]:bg-blue/10 dark:text-white">
                    <input type="checkbox" value={interest} className="accent-blue" {...form.register('interests')} /> {interest}
                  </label>
                ))}
              </div>
              {errors.interests && <p className="error-text">{errors.interests.message}</p>}
            </div>
            <Field label="ما الذي يدفعك للانضمام؟" htmlFor="motivation" error={errors.motivation?.message} wide>
              <textarea id="motivation" rows={4} className="input" {...form.register('motivation')} />
            </Field>

            {isMinor && (
              <div className="rounded-2xl border border-gold/50 bg-gold/10 p-4 sm:col-span-2">
                <p className="mb-4 font-black text-navy dark:text-white">بيانات ولي الأمر (المنخرط دون 18 سنة)</p>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="اسم ولي الأمر" htmlFor="guardian_name" error={errors.guardian_name?.message}>
                    <input id="guardian_name" className="input" {...form.register('guardian_name')} />
                  </Field>
                  <Field label="هاتف ولي الأمر" htmlFor="guardian_phone" error={errors.guardian_phone?.message}>
                    <input id="guardian_phone" type="tel" dir="ltr" className="input" {...form.register('guardian_phone')} />
                  </Field>
                </div>
                <label className="mt-4 flex items-start gap-3 text-sm leading-7 text-navy dark:text-white">
                  <input type="checkbox" className="mt-2 accent-blue" {...form.register('guardian_consent')} />
                  <span>أوافق بصفتي ولي الأمر على انخراط المذكور أعلاه في نادي المسار وعلى معالجة بياناته لهذا الغرض.</span>
                </label>
                {errors.guardian_consent && <p className="error-text">{errors.guardian_consent.message}</p>}
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="flex items-start gap-3 text-sm leading-7 text-navy dark:text-white">
                <input type="checkbox" className="mt-2 accent-blue" {...form.register('bylaws_accepted')} />
                <span>
                  أصرّح بأنني اطلعت على{' '}
                  <Link to="/bylaws" className="font-bold text-blue underline">النظام الداخلي</Link>{' '}
                  للنادي وأقبله، وأن المعلومات المقدمة صحيحة.
                </span>
              </label>
              {errors.bylaws_accepted && <p className="error-text">{errors.bylaws_accepted.message}</p>}
            </div>
          </>
        )}

        <div aria-hidden="true" className="absolute -start-[9999px] top-0 h-0 w-0 overflow-hidden">
          <label>
            لا تملأ هذا الحقل
            <input tabIndex={-1} autoComplete="off" {...form.register('website')} />
          </label>
        </div>
      </div>

      {submitError && (
        <p role="alert" className="mt-5 rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-700">
          {submitError}
        </p>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          disabled={step === 0}
          className="soft-button min-h-11 disabled:opacity-40"
        >
          <ArrowRight size={16} /> السابق
        </button>
        {isLastStep ? (
          <button type="submit" disabled={submitting} className="blue-button min-h-11 disabled:opacity-70">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {submitting ? 'جارٍ الإرسال' : 'إرسال الطلب'}
          </button>
        ) : (
          <button type="button" onClick={() => void goNext()} className="blue-button min-h-11">
            التالي <ArrowLeft size={16} />
          </button>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  wide,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <label htmlFor={htmlFor} className="label">{label}</label>
      <div className="mt-2">{children}</div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

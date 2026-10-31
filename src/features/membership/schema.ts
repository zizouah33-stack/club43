import { z } from 'zod';

export const INTERESTS = ['علوم', 'تكنولوجيا', 'سياحة', 'ثقافة'] as const;

export const MONTHS = [
  'جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان',
  'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const MIN_YEAR = 1930;
const DATE_ERROR = 'تاريخ الميلاد غير صحيح';

const numericRange = (min: number, max: number, message: string) =>
  z
    .string()
    .regex(/^\d+$/, message)
    .refine((value) => Number(value) >= min && Number(value) <= max, message);

export function toIsoDate(year: string, month: string, day: string) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (date.getTime() > Date.now()) return null;
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function ageFromIso(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const now = new Date();
  const age = now.getFullYear() - y;
  const beforeBirthday = now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d);
  return beforeBirthday ? age - 1 : age;
}

export const membershipSchema = z
  .object({
    first_name: z.string().trim().min(2, 'يرجى إدخال الاسم الأول (حرفان على الأقل)').max(60, 'الاسم طويل جداً'),
    last_name: z.string().trim().min(2, 'يرجى إدخال اللقب (حرفان على الأقل)').max(60, 'اللقب طويل جداً'),
    birth_day: numericRange(1, 31, DATE_ERROR),
    birth_month: numericRange(1, 12, DATE_ERROR),
    birth_year: numericRange(MIN_YEAR, new Date().getFullYear(), DATE_ERROR),
    gender: z.enum(['male', 'female'], { message: 'يرجى اختيار الجنس' }),
    phone: z.string().trim().regex(/^\+?[0-9 ]{8,20}$/, 'يرجى إدخال رقم هاتف صحيح'),
    email: z.string().trim().email('يرجى إدخال بريد إلكتروني صحيح').max(254, 'البريد طويل جداً'),
    address: z.string().trim().min(3, 'يرجى إدخال البلدية أو العنوان').max(200, 'العنوان طويل جداً'),
    education_or_job: z.string().trim().min(2, 'يرجى إدخال المستوى الدراسي أو المهنة').max(120),
    interests: z.array(z.enum(INTERESTS)).min(1, 'اختر اهتماماً واحداً على الأقل'),
    motivation: z.string().trim().min(10, 'اكتب دافعك في سطرين على الأقل').max(1000, 'النص طويل جداً'),
    guardian_name: z.string().trim().max(120, 'الاسم طويل جداً').optional(),
    guardian_phone: z
      .string()
      .trim()
      .regex(/^(\+?[0-9 ]{8,20})?$/, 'يرجى إدخال رقم هاتف صحيح')
      .optional(),
    guardian_consent: z.boolean(),
    bylaws_accepted: z.boolean().refine((value) => value, 'يجب قبول النظام الداخلي'),
    website: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    const iso = toIsoDate(values.birth_year, values.birth_month, values.birth_day);
    if (!iso) {
      ctx.addIssue({ code: 'custom', path: ['birth_day'], message: DATE_ERROR });
      return;
    }
    if (ageFromIso(iso) >= 18) return;
    if (!values.guardian_name) {
      ctx.addIssue({ code: 'custom', path: ['guardian_name'], message: 'اسم ولي الأمر مطلوب للمنخرطين دون 18 سنة' });
    }
    if (!values.guardian_phone) {
      ctx.addIssue({ code: 'custom', path: ['guardian_phone'], message: 'هاتف ولي الأمر مطلوب للمنخرطين دون 18 سنة' });
    }
    if (!values.guardian_consent) {
      ctx.addIssue({ code: 'custom', path: ['guardian_consent'], message: 'موافقة ولي الأمر مطلوبة للمنخرطين دون 18 سنة' });
    }
  });

export type MembershipValues = z.infer<typeof membershipSchema>;

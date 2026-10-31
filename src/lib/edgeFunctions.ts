import { supabase } from '@/lib/supabase';

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'انتهت جلسة الدخول. سجّل الدخول مجدداً.',
  forbidden: 'ليست لديك صلاحية تنفيذ هذا الإجراء.',
  not_found: 'العنصر المطلوب غير موجود.',
  already_rejected: 'هذا الطلب مرفوض بالفعل.',
  already_approved: 'هذا الطلب مقبول بالفعل.',
  account_creation_failed: 'تعذر إنشاء حساب العضو. حاول مرة أخرى.',
  missing_birth_date: 'تاريخ ميلاد المتقدم غير مسجل.',
  email_not_configured: 'خدمة البريد الإلكتروني غير مهيأة بعد.',
};

type InvokeResult<T> = { data: T; errorMessage: null } | { data: null; errorMessage: string };

export async function invokeAdminFunction<T>(name: string, body: Record<string, unknown>): Promise<InvokeResult<T>> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (!error) return { data: data as T, errorMessage: null };

  let code = '';
  try {
    const payload = (await (error as { context?: Response }).context?.json()) as { error?: string } | undefined;
    code = payload?.error ?? '';
  } catch {
    code = '';
  }
  return { data: null, errorMessage: ERROR_MESSAGES[code] ?? 'تعذر تنفيذ العملية. حاول مرة أخرى.' };
}

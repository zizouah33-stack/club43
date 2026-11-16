import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Pencil, Printer, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { invokeAdminFunction } from '@/lib/edgeFunctions';

type MemberProfile = {
  id: string;
  membership_number: string;
  application_id: string | null;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  birth_date: string;
  gender: string | null;
  real_email: string;
  phone: string;
  address: string;
  photo_url: string | null;
  education_or_job: string;
  interests: string[];
  motivation: string;
  guardian_name: string | null;
  guardian_phone: string | null;
  guardian_consent: boolean;
  bylaws_accepted: boolean;
  application_submitted_at: string | null;
  status: 'active' | 'suspended' | 'expelled';
  must_change_password: boolean;
  joined_at: string;
  updated_at: string;
};

type ApplicationRow = {
  id: string;
  created_at: string;
  approved_at: string | null;
  reviewed_at: string | null;
  status: 'pending' | 'approved' | 'rejected';
};

type AuditRow = { id: string; action: string; details: Record<string, unknown>; created_at: string };

type FieldUpdate = { field: string; label: string; from: string; to: string };

const MISSING = 'لم يتم تقديم هذه المعلومة';

const GENDER_LABEL: Record<string, string> = { male: 'ذكر', female: 'أنثى' };
const STATUS_LABEL: Record<MemberProfile['status'], string> = { active: 'نشط', suspended: 'موقوف', expelled: 'مطرود' };
const INTEREST_OPTIONS = ['علوم', 'تكنولوجيا', 'سياحة', 'ثقافة'];

type FieldKind = 'text' | 'date' | 'gender' | 'interests' | 'motivation' | 'boolean';

type FieldDef = { field: keyof MemberProfile & string; label: string; kind: FieldKind; dir?: 'ltr' };

const SECTIONS: { title: string; fields: FieldDef[] }[] = [
  {
    title: 'المعلومات الشخصية',
    fields: [
      { field: 'first_name', label: 'الاسم' },
      { field: 'last_name', label: 'اللقب' },
      { field: 'birth_date', label: 'تاريخ الميلاد', kind: 'date' },
      { field: 'gender', label: 'الجنس', kind: 'gender' },
    ],
  },
  {
    title: 'معلومات الاتصال',
    fields: [
      { field: 'real_email', label: 'البريد الإلكتروني', dir: 'ltr' },
      { field: 'phone', label: 'رقم الهاتف', kind: 'text', dir: 'ltr' },
    ],
  },
  {
    title: 'معلومات الإقامة والعنوان',
    fields: [{ field: 'address', label: 'البلدية / العنوان' }],
  },
  {
    title: 'المعلومات الدراسية أو المهنية',
    fields: [{ field: 'education_or_job', label: 'المستوى الدراسي أو المهنة' }],
  },
  {
    title: 'الاهتمامات والمجالات',
    fields: [{ field: 'interests', label: 'الاهتمامات', kind: 'interests' }],
  },
  {
    title: 'أسباب الانضمام والأهداف',
    fields: [{ field: 'motivation', label: 'دافع الانخراط', kind: 'motivation' }],
  },
  {
    title: 'معلومات ولي الأمر (للأطفال دون 18 سنة)',
    fields: [
      { field: 'guardian_name', label: 'اسم ولي الأمر' },
      { field: 'guardian_phone', label: 'هاتف ولي الأمر', dir: 'ltr' },
      { field: 'guardian_consent', label: 'موافقة ولي الأمر', kind: 'boolean' },
    ],
  },
  {
    title: 'الالتزامات',
    fields: [{ field: 'bylaws_accepted', label: 'قبول النظام الداخلي', kind: 'boolean' }],
  },
];

const EDITABLE_FIELDS = new Set(SECTIONS.flatMap((section) => section.fields.map((f) => f.field)));

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ar-DZ') : null);
const formatDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ar-DZ') : null);

function displayValue(profile: MemberProfile, def: FieldDef): string {
  const raw = profile[def.field];
  if (def.kind === 'boolean') return raw === true ? 'نعم' : raw === false ? 'لا' : MISSING;
  if (typeof raw !== 'string' || raw.trim() === '') return MISSING;
  if (def.kind === 'date') return formatDate(raw) ?? MISSING;
  if (def.kind === 'gender') return GENDER_LABEL[raw] ?? MISSING;
  return raw;
}

export default function MemberProfilePage({ memberId }: { memberId: string }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [application, setApplication] = useState<ApplicationRow | null>(null);
  const [history, setHistory] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>('');
  const [draftInterests, setDraftInterests] = useState<string[]>([]);
  const [draftBoolean, setDraftBoolean] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: profileError } = await supabase
      .from('members')
      .select('*')
      .eq('id', memberId)
      .maybeSingle();
    if (profileError || !data) {
      setError('تعذر تحميل ملف العضو. قد يكون الحساب غير موجود أو الحالة غير مسموحة.');
      setLoading(false);
      return;
    }
    setProfile(data as MemberProfile);
    const member = data as MemberProfile;
    if (member.application_id) {
      const { data: appData } = await supabase
        .from('membership_applications')
        .select('id, created_at, approved_at, reviewed_at, status')
        .eq('id', member.application_id)
        .maybeSingle();
      setApplication((appData as ApplicationRow) ?? null);
      const { data: historyData } = await supabase
        .from('audit_log')
        .select('id, action, details, created_at')
        .eq('target_type', 'member')
        .eq('target_id', memberId)
        .order('created_at', { ascending: false })
        .limit(20);
      setHistory((historyData as AuditRow[]) ?? []);
    }
    setLoading(false);
  }, [memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (def: FieldDef) => {
    setNotice('');
    setEditingField(def.field);
    const raw = profile?.[def.field];
    if (def.kind === 'interests') {
      setDraftInterests(Array.isArray(raw) ? raw : []);
    } else if (def.kind === 'boolean') {
      setDraftBoolean(raw === true);
    } else {
      setDraft(typeof raw === 'string' ? raw : raw == null ? '' : String(raw));
    }
  };

  const saveEdit = async (def: FieldDef) => {
    if (!profile) return;
    setSaving(true);
    setNotice('');
    let value: unknown;
    if (def.kind === 'interests') value = draftInterests;
    else if (def.kind === 'boolean') value = draftBoolean;
    else value = draft.trim() === '' ? null : draft.trim();

    const result = await invokeAdminFunction('manage-member', {
      member_id: profile.id,
      action: 'update_profile',
      profile: { [def.field]: value },
    });
    setSaving(false);
    if (result.errorMessage) {
      setError(result.errorMessage);
      return;
    }
    setEditingField(null);
    setNotice('تم حفظ التعديل.');
    await load();
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-sand dark:bg-navy">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-navy/15 border-t-blue" role="status" aria-label="جارٍ التحميل" />
      </main>
    );
  }

  if (error && !profile) {
    return (
      <main className="min-h-screen bg-sand px-4 py-8 dark:bg-navy sm:px-8">
        <div className="mx-auto max-w-2xl space-y-4">
          <BackButton onClick={() => navigate('/admin/members')} />
          <div className="soft-card p-8 text-center">
            <p className="font-black text-navy dark:text-white">{error}</p>
          </div>
        </div>
      </main>
    );
  }

  if (!profile) return null;

  const age = profile.birth_date ? Math.floor((Date.now() - new Date(profile.birth_date).getTime()) / (365.25 * 24 * 3600 * 1000)) : null;
  const isMinor = age !== null && age < 18;

  return (
    <main className="min-h-screen bg-sand px-4 py-8 dark:bg-navy sm:px-8 print:bg-white">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <button type="button" onClick={() => navigate('/admin/members')} className="inline-flex items-center gap-2 text-sm font-bold text-blue">
            <ArrowRight size={16} /> العودة إلى قائمة الأعضاء
          </button>
          <button type="button" onClick={() => window.print()} className="soft-button min-h-11">
            <Printer size={16} /> طباعة الملف
          </button>
        </div>

        <header className="soft-card flex flex-wrap items-center gap-5 p-6">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-navy/10 dark:bg-white/10">
            {profile.photo_url ? (
              <img src={profile.photo_url} alt={`صورة ${profile.full_name}`} className="h-full w-full object-cover" />
            ) : (
              <span className="text-3xl font-black text-navy dark:text-white">{profile.full_name.charAt(0)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-black text-navy dark:text-white">{profile.full_name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-navy/10 px-3 py-1 font-mono font-bold text-navy dark:bg-white/10 dark:text-white" dir="ltr">{profile.membership_number}</span>
              <span className={`rounded-full px-3 py-1 font-bold ${profile.status === 'active' ? 'bg-teal/15 text-teal' : profile.status === 'suspended' ? 'bg-gold/25 text-navy' : 'bg-red-500/10 text-red-700'}`}>
                {STATUS_LABEL[profile.status]}
              </span>
            </div>
          </div>
          <dl className="grid w-full gap-2 text-sm sm:w-auto sm:grid-cols-2">
            <div><dt className="text-xs font-bold text-muted">تاريخ تقديم الطلب</dt><dd className="font-semibold text-navy dark:text-white">{formatDateTime(profile.application_submitted_at ?? application?.created_at ?? null) ?? MISSING}</dd></div>
            <div><dt className="text-xs font-bold text-muted">تاريخ القبول</dt><dd className="font-semibold text-navy dark:text-white">{formatDateTime(application?.approved_at ?? null) ?? MISSING}</dd></div>
          </dl>
        </header>

        {error && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl bg-red-500/10 p-4 text-sm font-bold text-red-700 print:hidden">
            {error}
            <button type="button" onClick={() => setError('')} aria-label="إخفاء الخطأ"><X size={16} /></button>
          </div>
        )}
        {notice && <p role="status" className="rounded-2xl bg-teal/10 p-4 text-sm font-bold text-teal print:hidden">{notice}</p>}

        {SECTIONS.map((section) => (
          <section key={section.title} className="soft-card p-6 print:break-inside-avoid">
            <h2 className="text-lg font-black text-navy dark:text-white">{section.title}</h2>
            <dl className="mt-5 grid gap-5 sm:grid-cols-2">
              {section.fields.map((def) => {
                const value = displayValue(profile, def);
                const isEditing = editingField === def.field;
                return (
                  <div key={def.field} className={def.field === 'motivation' ? 'sm:col-span-2' : ''}>
                    <dt className="text-xs font-bold text-muted">{def.label}</dt>
                    <dd className="mt-1 break-words text-sm font-semibold text-navy dark:text-white" dir={def.dir}>
                      {isEditing ? (
                        <div className="mt-2 space-y-3 rounded-2xl border border-blue/40 bg-white p-4 dark:bg-white/5 print:hidden">
                          {def.kind === 'interests' ? (
                            <div className="flex flex-wrap gap-2">
                              {INTEREST_OPTIONS.map((option) => (
                                <label key={option} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-navy/5 px-3 py-1.5 text-xs font-bold text-navy dark:bg-white/10 dark:text-white">
                                  <input
                                    type="checkbox"
                                    checked={draftInterests.includes(option)}
                                    onChange={(event) => setDraftInterests((current) => event.target.checked ? [...current, option] : current.filter((item) => item !== option))}
                                  />
                                  {option}
                                </label>
                              ))}
                            </div>
                          ) : def.kind === 'boolean' ? (
                            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-navy dark:text-white">
                              <input type="checkbox" checked={draftBoolean} onChange={(event) => setDraftBoolean(event.target.checked)} />
                              {def.label}
                            </label>
                          ) : def.kind === 'motivation' ? (
                            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} maxLength={1000} className="input" />
                          ) : (
                            <input
                              type={def.kind === 'date' ? 'date' : 'text'}
                              value={draft}
                              onChange={(event) => setDraft(event.target.value)}
                              dir={def.dir}
                              maxLength={def.field === 'motivation' ? 1000 : 254}
                              className="input"
                            />
                          )}
                          <div className="flex gap-2">
                            <button type="button" disabled={saving} onClick={() => void saveEdit(def)} className="blue-button min-h-10 px-4 text-xs disabled:opacity-60">حفظ</button>
                            <button type="button" onClick={() => setEditingField(null)} className="soft-button min-h-10 px-4 text-xs">إلغاء</button>
                          </div>
                        </div>
                      ) : def.kind === 'interests' ? (
                        (profile.interests?.length ?? 0) > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-2">
                            {profile.interests.map((interest) => (
                              <span key={interest} className="rounded-full bg-blue/10 px-3 py-1 text-xs font-bold text-blue">{interest}</span>
                            ))}
                          </div>
                        ) : MISSING
                      ) : def.kind === 'motivation' ? (
                        <p className="mt-1 whitespace-pre-line rounded-2xl bg-white p-4 text-sm font-normal leading-7 text-navy dark:bg-white/5 dark:text-white">{value}</p>
                      ) : (
                        value
                      )}
                    </dd>
                    {!isEditing && EDITABLE_FIELDS.has(def.field) && (
                      <button type="button" onClick={() => startEdit(def)} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue print:hidden">
                        <Pencil size={12} /> تعديل
                      </button>
                    )}
                  </div>
                );
              })}
            </dl>
          </section>
        ))}

        <section className="soft-card p-6 print:break-inside-avoid">
          <h2 className="text-lg font-black text-navy dark:text-white">الطلب الأصلي والوثائق</h2>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-bold text-muted">حالة الطلب الأصلي</dt>
              <dd className="mt-1 font-semibold text-navy dark:text-white">
                {application ? (application.status === 'approved' ? 'مقبول' : application.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة') : MISSING}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-muted">معرّف الطلب المرتبط</dt>
              <dd className="mt-1 font-mono text-xs text-muted" dir="ltr">{profile.application_id ?? MISSING}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-muted">صورة العضو</dt>
              <dd className="mt-1">
                {profile.photo_url ? (
                  <a href={profile.photo_url} target="_blank" rel="noopener noreferrer" className="font-bold text-blue underline">فتح الصورة المرفقة</a>
                ) : MISSING}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-muted">حالة كلمة السر</dt>
              <dd className="mt-1 font-semibold text-navy dark:text-white">{profile.must_change_password ? 'يجب تغييرها عند أول دخول' : 'مُحدّثة'}</dd>
            </div>
          </dl>
        </section>

        <section className="soft-card p-6 print:break-inside-avoid">
          <h2 className="text-lg font-black text-navy dark:text-white">سجل التعديلات المهمة</h2>
          {history.length === 0 ? (
            <p className="mt-3 text-sm text-muted">لا توجد تعديلات مسجلة على هذا الملف.</p>
          ) : (
            <ul className="mt-4 space-y-3 text-sm">
              {history.map((entry) => (
                <li key={entry.id} className="rounded-2xl bg-white p-4 dark:bg-white/5">
                  <p className="font-bold text-navy dark:text-white">
                    {entry.action === 'member_update_profile' ? 'تعديل بيانات الملف' : entry.action}
                  </p>
                  <p className="mt-1 text-xs text-muted" dir="rtl">{formatDateTime(entry.created_at)}</p>
                  {Array.isArray(entry.details?.fields) && (
                    <p className="mt-1 text-xs text-muted">الحقول المعدلة: {(entry.details.fields as string[]).join('، ')}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 text-sm font-bold text-blue">
      <ArrowRight size={16} /> العودة إلى قائمة الأعضاء
    </button>
  );
}

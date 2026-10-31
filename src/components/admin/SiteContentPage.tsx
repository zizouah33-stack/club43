import { useEffect, useState } from 'react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { SITE_CONTENT_DEFAULTS, SITE_CONTENT_GROUPS, type SiteContentKey } from '@/features/content/siteContentDefaults';

type Values = Partial<Record<SiteContentKey, string>>;

export default function SiteContentPage() {
  const navigate = useNavigate();
  const [values, setValues] = useState<Values>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from('site_content')
      .select('key, value')
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !Array.isArray(data)) {
          setLoadError('تعذر تحميل النصوص. حاول مرة أخرى.');
        } else {
          const next: Values = {};
          for (const row of data) {
            if (typeof row?.key === 'string' && typeof row?.value === 'string' && row.key in SITE_CONTENT_DEFAULTS) {
              next[row.key as SiteContentKey] = row.value;
            }
          }
          setValues(next);
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-sand px-4 py-8 dark:bg-navy sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <button type="button" onClick={() => navigate('/admin/dashboard')} className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-blue">
            <ArrowRight size={16} /> العودة إلى لوحة الإدارة
          </button>
          <h1 className="text-2xl font-black text-navy dark:text-white">نصوص الموقع</h1>
          <p className="mt-2 text-sm leading-6 text-muted">عدّل النصوص التي تظهر في الصفحة الرئيسية وصفحات الأنشطة والفعاليات والدليل السياحي. يظهر التعديل للزوار بعد الحفظ.</p>
        </header>

        {loading && (
          <div className="flex items-center gap-2 text-sm font-bold text-muted">
            <Loader2 size={16} className="animate-spin" /> جاري تحميل النصوص...
          </div>
        )}
        {loadError && <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{loadError}</p>}

        {!loading && !loadError && SITE_CONTENT_GROUPS.map((group) => (
          <section key={group.title} className="soft-card space-y-5 p-6">
            <h2 className="text-lg font-black text-navy dark:text-white">{group.title}</h2>
            {group.keys.map((key) => (
              <SiteTextRow
                key={key}
                contentKey={key}
                initialValue={values[key] ?? SITE_CONTENT_DEFAULTS[key]}
                onSaved={(value) => setValues((prev) => ({ ...prev, [key]: value }))}
              />
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}

function SiteTextRow({ contentKey, initialValue, onSaved }: { contentKey: SiteContentKey; initialValue: string; onSaved: (value: string) => void }) {
  const [draft, setDraft] = useState(initialValue);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const trimmed = draft.trim();
  const dirty = draft !== initialValue;

  const save = async () => {
    if (!trimmed) {
      setStatus('error');
      setErrorMessage('لا يمكن ترك النص فارغاً.');
      return;
    }
    setStatus('saving');
    setErrorMessage(null);
    const { error } = await supabase.from('site_content').upsert({ key: contentKey, value: trimmed }, { onConflict: 'key' });
    if (error) {
      setStatus('error');
      setErrorMessage('تعذر حفظ النص. تأكد من تسجيل الدخول بحساب الإدارة وحاول مرة أخرى.');
      return;
    }
    onSaved(trimmed);
    setDraft(trimmed);
    setStatus('saved');
  };

  return (
    <div className="space-y-2">
      <label htmlFor={`site-${contentKey}`} className="text-sm font-bold text-navy dark:text-white">{contentKey}</label>
      <textarea
        id={`site-${contentKey}`}
        rows={2}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setStatus('idle');
        }}
        className="input w-full"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || status === 'saving'}
          className="blue-button min-h-11 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === 'saving' ? <Loader2 size={16} className="animate-spin" /> : null}
          حفظ
        </button>
        {status === 'saved' && !dirty && <span className="inline-flex items-center gap-1 text-sm font-bold text-teal"><Check size={16} /> تم الحفظ</span>}
        {status === 'error' && errorMessage && <span role="alert" className="text-sm font-bold text-red-700">{errorMessage}</span>}
      </div>
    </div>
  );
}

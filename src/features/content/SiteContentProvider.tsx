import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { SITE_CONTENT_DEFAULTS, type SiteContentKey } from '@/features/content/siteContentDefaults';
import { SiteTextContext, type SiteTextLookup } from '@/features/content/useSiteText';

export function SiteContentProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<Partial<Record<SiteContentKey, string>>>({});

  useEffect(() => {
    let active = true;
    supabase
      .from('site_content')
      .select('key, value')
      .then(({ data, error }) => {
        if (!active || error || !Array.isArray(data)) return;
        const next: Partial<Record<SiteContentKey, string>> = {};
        for (const row of data) {
          if (typeof row?.key !== 'string' || typeof row?.value !== 'string') continue;
          if (row.key in SITE_CONTENT_DEFAULTS) next[row.key as SiteContentKey] = row.value;
        }
        setOverrides(next);
      });
    return () => {
      active = false;
    };
  }, []);

  const lookup = useMemo<SiteTextLookup>(
    () => (key) => overrides[key] ?? SITE_CONTENT_DEFAULTS[key],
    [overrides],
  );

  return <SiteTextContext.Provider value={lookup}>{children}</SiteTextContext.Provider>;
}

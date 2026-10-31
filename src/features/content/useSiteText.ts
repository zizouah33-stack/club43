import { createContext, useContext } from 'react';
import { SITE_CONTENT_DEFAULTS, type SiteContentKey } from '@/features/content/siteContentDefaults';

export type SiteTextLookup = (key: SiteContentKey) => string;

export const SiteTextContext = createContext<SiteTextLookup>((key) => SITE_CONTENT_DEFAULTS[key]);

export function useSiteText() {
  return useContext(SiteTextContext);
}

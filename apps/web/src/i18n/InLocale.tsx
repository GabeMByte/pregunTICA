import type { ReactNode } from 'react';
import { i18nFor, I18nContext } from './i18n-context.js';
import type { Locale } from './locale.js';

/** For tests: renders `children` in a fixed interface language, without detection or storage. */
export function InLocale({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nContext value={i18nFor(locale, () => undefined)}>{children}</I18nContext>;
}

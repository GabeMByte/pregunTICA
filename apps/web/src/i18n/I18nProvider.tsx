import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { i18nFor, I18nContext } from './i18n-context.js';
import { initialLocale, saveLocale, type Locale } from './locale.js';

/** Picks the interface language (saved choice, else the device's) and keeps <html lang> in sync. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale(navigator.languages));

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    saveLocale(next);
    setLocaleState(next);
  }, []);

  const value = useMemo(() => i18nFor(locale, setLocale), [locale, setLocale]);
  return <I18nContext value={value}>{children}</I18nContext>;
}

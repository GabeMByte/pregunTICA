import { createContext } from 'react';
import { en } from './en.js';
import { es, type Dictionary } from './es.js';
import { INTL_LOCALES, type Locale } from './locale.js';

export interface I18n {
  locale: Locale;
  t: Dictionary;
  setLocale: (locale: Locale) => void;
  /** Grouped as the language expects: 12 345 in Spanish, 12,345 in English. */
  formatNumber: (value: number) => string;
}

export const DICTIONARIES: Record<Locale, Dictionary> = { es, en };

const numberFormats: Record<Locale, Intl.NumberFormat> = {
  es: new Intl.NumberFormat(INTL_LOCALES.es),
  en: new Intl.NumberFormat(INTL_LOCALES.en),
};

export function i18nFor(locale: Locale, setLocale: (locale: Locale) => void): I18n {
  const format = numberFormats[locale];
  return { locale, t: DICTIONARIES[locale], setLocale, formatNumber: (value) => format.format(value) };
}

/**
 * Spanish outside a provider, so a component rendered on its own (as in its tests) reads like the
 * app always did. The app itself is wrapped in I18nProvider (App.tsx).
 */
export const I18nContext = createContext<I18n>(i18nFor('es', () => undefined));

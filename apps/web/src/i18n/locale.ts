import { LanguageSchema, type Language } from '@preguntica/shared';

/** The interface language of this device. Independent of the questions' language of a room. */
export type Locale = Language;

export const LOCALE_KEY = 'preguntica:locale';

/** For Intl: Costa Rican Spanish groups thousands with a space (12 345), US English with a comma. */
export const INTL_LOCALES: Record<Locale, string> = { es: 'es-CR', en: 'en-US' };

type GetStorage = () => Storage;
const browserStorage: GetStorage = () => window.localStorage;

/** Spanish if any preferred language is Spanish (es, es-CR, es-MX...), English otherwise. */
export function detectLocale(languages: readonly string[]): Locale {
  return languages.some((language) => /^es(-|$)/i.test(language)) ? 'es' : 'en';
}

/** The language picked with the switch, or null. Blocked or tampered storage just means no choice. */
export function readLocale(getStorage: GetStorage = browserStorage): Locale | null {
  try {
    const parsed = LanguageSchema.safeParse(getStorage().getItem(LOCALE_KEY));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveLocale(locale: Locale, getStorage: GetStorage = browserStorage): void {
  try {
    getStorage().setItem(LOCALE_KEY, locale);
  } catch {
    // Without storage the switch still works until the page is reloaded.
  }
}

/** The switch wins over the device language. */
export function initialLocale(languages: readonly string[], getStorage: GetStorage = browserStorage): Locale {
  return readLocale(getStorage) ?? detectLocale(languages);
}

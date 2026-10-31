import { useContext } from 'react';
import { I18nContext, type I18n } from './i18n-context.js';

/** The current language's dictionary and helpers: `const { t } = useT();`. */
export function useT(): I18n {
  return useContext(I18nContext);
}

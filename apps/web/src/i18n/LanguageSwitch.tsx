import type { Locale } from './locale.js';
import { useT } from './useT.js';
import styles from './LanguageSwitch.module.css';

const LOCALES: readonly Locale[] = ['es', 'en'];

/**
 * The ES / EN switch. Only on calm screens (home, host form, lobbies, join, podium): never during a
 * question, its reveal or the ranking, where a stray tap on a phone would cost something.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const { t, locale, setLocale } = useT();
  return (
    <div role="group" aria-label={t.languageSwitch.label} className={[styles.switch, className].filter(Boolean).join(' ')}>
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          className={styles.option}
          aria-pressed={option === locale}
          title={option === 'es' ? t.languageSwitch.esName : t.languageSwitch.enName}
          onClick={() => {
            setLocale(option);
          }}
        >
          {option === 'es' ? t.languageSwitch.es : t.languageSwitch.en}
        </button>
      ))}
    </div>
  );
}

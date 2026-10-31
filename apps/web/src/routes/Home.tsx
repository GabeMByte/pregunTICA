import { Link } from 'react-router';
import { OptionShape } from '../components/OptionShape.js';
import { OPTION_SHAPES } from '../components/option-shapes.js';
import { Wordmark } from '../components/Wordmark.js';
import { LanguageSwitch } from '../i18n/LanguageSwitch.js';
import { useT } from '../i18n/useT.js';
import styles from './Home.module.css';

export function Home() {
  const { t } = useT();
  return (
    <main className={styles.page}>
      <LanguageSwitch className={styles.language} />
      <div className={styles.shapes} aria-hidden="true">
        {OPTION_SHAPES.map((shape) => (
          <OptionShape key={shape} shape={shape} className={`${styles.shape} ${styles[shape]}`} />
        ))}
      </div>

      <header className={styles.hero}>
        <h1>
          <Wordmark size="l" />
        </h1>
        <p className={styles.tagline}>{t.home.tagline}</p>
      </header>

      <nav className={styles.actions} aria-label={t.home.start}>
        <Link to="/host" className={`${styles.action} ${styles.primary}`}>
          <span className={styles.actionTitle}>{t.home.create}</span>
          <span className={styles.actionHint}>{t.home.createHint}</span>
        </Link>
        <Link to="/play" className={`${styles.action} ${styles.secondary}`}>
          <span className={styles.actionTitle}>{t.home.join}</span>
          <span className={styles.actionHint}>{t.home.joinHint}</span>
        </Link>
      </nav>
    </main>
  );
}

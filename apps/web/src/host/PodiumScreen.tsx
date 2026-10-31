import type { PodiumEntry } from '@preguntica/shared';
import { Wordmark } from '../components/Wordmark.js';
import { LanguageSwitch } from '../i18n/LanguageSwitch.js';
import { useT } from '../i18n/useT.js';
import styles from './PodiumScreen.module.css';

export function PodiumScreen({ entries }: { entries: PodiumEntry[] }) {
  const { t, formatNumber } = useT();
  return (
    <main className={styles.page}>
      <LanguageSwitch className={styles.language} />
      <Wordmark size="s" />
      <h1 className={styles.title}>{t.podium.title}</h1>
      {entries.length === 0 ? (
        <p className={styles.empty}>{t.podium.empty}</p>
      ) : (
        <ol className={styles.podium}>
          {entries.map(({ rank, nickname, score }) => (
            <li key={nickname} className={styles.place} data-rank={rank}>
              <p className={styles.nickname}>{nickname}</p>
              <p className={styles.score}>{formatNumber(score)}</p>
              <div className={styles.step} role="img" aria-label={t.ranking.rank(rank)}>
                {rank}
              </div>
            </li>
          ))}
        </ol>
      )}
      {/* A full load, not a route change: it starts a clean game with the session already cleared. */}
      <a className={styles.again} href="/host">
        {t.podium.again}
      </a>
    </main>
  );
}

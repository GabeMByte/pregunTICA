import type { AnswerResult } from '@preguntica/shared';
import { Wordmark } from '../../components/Wordmark.js';
import type { PlayerRank } from '../player-view.js';
import { useT } from '../../i18n/useT.js';
import styles from './RevealScreen.module.css';

export interface RevealScreenProps {
  /** Missing only if the server has no result for this player: never guess one. */
  result: AnswerResult | undefined;
  rank: PlayerRank | null;
}

export function RevealScreen({ result, rank }: RevealScreenProps) {
  const { t, formatNumber } = useT();
  const position = rank !== null && (
    <p className={styles.position}>
      {t.playerReveal.position} <strong>{rank.rank}</strong> {t.playerReveal.of} {rank.total}
    </p>
  );

  if (result === undefined) {
    return (
      <main className={styles.screen}>
        <Wordmark size="s" />
        <h1 className={styles.title}>{t.playerReveal.lookUp}</h1>
        {position}
      </main>
    );
  }

  return (
    <main className={`${styles.screen} ${result.correct ? styles.correct : styles.wrong}`}>
      <span className={styles.icon} aria-hidden="true">
        {result.correct ? '✓' : '✕'}
      </span>
      <h1 className={styles.title}>{result.correct ? t.playerReveal.correct : t.playerReveal.wrong}</h1>
      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>{t.playerReveal.points}</dt>
          <dd>+{formatNumber(result.points)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>{t.playerReveal.streak}</dt>
          <dd>{result.streak}</dd>
        </div>
      </dl>
      {position}
    </main>
  );
}

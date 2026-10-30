import type { AnswerResult } from '@preguntica/shared';
import { Wordmark } from '../../components/Wordmark.js';
import type { PlayerRank } from '../player-view.js';
import { scoreFormat } from './score-format.js';
import styles from './RevealScreen.module.css';

export interface RevealScreenProps {
  /** Missing only if the server has no result for this player: never guess one. */
  result: AnswerResult | undefined;
  rank: PlayerRank | null;
}

export function RevealScreen({ result, rank }: RevealScreenProps) {
  const position = rank !== null && (
    <p className={styles.position}>
      Vas en el puesto <strong>{rank.rank}</strong> de {rank.total}
    </p>
  );

  if (result === undefined) {
    return (
      <main className={styles.screen}>
        <Wordmark size="s" />
        <h1 className={styles.title}>Mira la pantalla</h1>
        {position}
      </main>
    );
  }

  return (
    <main className={`${styles.screen} ${result.correct ? styles.correct : styles.wrong}`}>
      <span className={styles.icon} aria-hidden="true">
        {result.correct ? '✓' : '✕'}
      </span>
      <h1 className={styles.title}>{result.correct ? '¡Correcto!' : 'Incorrecto'}</h1>
      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>Puntos ganados</dt>
          <dd>+{scoreFormat.format(result.points)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Racha</dt>
          <dd>{result.streak}</dd>
        </div>
      </dl>
      {position}
    </main>
  );
}

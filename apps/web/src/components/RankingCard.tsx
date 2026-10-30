import styles from './RankingCard.module.css';

const scoreFormat = new Intl.NumberFormat('es-CR');

export interface RankingCardProps {
  /** 1-based position. */
  rank: number;
  nickname: string;
  score: number;
  /** Points won in the last question. */
  delta?: number;
  /** The player looking at their own row. */
  highlight?: boolean;
  size?: 'phone' | 'projector';
}

export function RankingCard({ rank, nickname, score, delta = 0, highlight = false, size = 'phone' }: RankingCardProps) {
  const podium = rank <= 3 ? styles[`rank${String(rank)}`] : '';
  return (
    <li
      className={[styles.card, styles[size], podium, highlight ? styles.highlight : ''].join(' ')}
      aria-current={highlight ? 'true' : undefined}
    >
      <span className={styles.rank} aria-label={`Puesto ${String(rank)}`}>
        {rank}
      </span>
      <span className={styles.nickname}>{nickname}</span>
      <span className={styles.points}>
        <span className={styles.score}>{scoreFormat.format(score)}</span>
        {delta > 0 && <span className={styles.delta}>+{scoreFormat.format(delta)}</span>}
      </span>
    </li>
  );
}

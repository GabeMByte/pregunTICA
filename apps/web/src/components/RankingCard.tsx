import { useT } from '../i18n/useT.js';
import styles from './RankingCard.module.css';

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
  const { t, formatNumber } = useT();
  const podium = rank <= 3 ? styles[`rank${String(rank)}`] : '';
  return (
    <li
      className={[styles.card, styles[size], podium, highlight ? styles.highlight : ''].join(' ')}
      aria-current={highlight ? 'true' : undefined}
    >
      <span className={styles.rank} aria-label={t.ranking.rank(rank)}>
        {rank}
      </span>
      <span className={styles.nickname}>{nickname}</span>
      <span className={styles.points}>
        <span className={styles.score}>{formatNumber(score)}</span>
        {delta > 0 && <span className={styles.delta}>+{formatNumber(delta)}</span>}
      </span>
    </li>
  );
}

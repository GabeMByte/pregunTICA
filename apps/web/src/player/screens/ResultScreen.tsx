import { Link } from 'react-router';
import { RankingCard } from '../../components/RankingCard.js';
import { Wordmark } from '../../components/Wordmark.js';
import type { Dictionary } from '../../i18n/es.js';
import { LanguageSwitch } from '../../i18n/LanguageSwitch.js';
import { useT } from '../../i18n/useT.js';
import type { PlayerRank } from '../player-view.js';
import styles from './ResultScreen.module.css';

export interface ResultEntry {
  nickname: string;
  score: number;
  delta?: number;
}

export interface ResultScreenProps {
  /** Podium: the game is over. */
  final: boolean;
  /** Best first; the server only sends the top of the ranking. */
  entries: readonly ResultEntry[];
  nickname: string | null;
  rank: PlayerRank | null;
}

function headline(t: Dictionary, final: boolean, rank: PlayerRank | null): string {
  if (rank === null) return final ? t.result.gameOver : t.result.ranking;
  if (!final) return t.result.standing;
  return rank.rank === 1 ? t.result.won : t.result.finished;
}

export function ResultScreen({ final, entries, nickname, rank }: ResultScreenProps) {
  const { t } = useT();
  return (
    <main className={styles.screen}>
      {final && <LanguageSwitch className={styles.language} />}
      <Wordmark size="s" />
      <div className={styles.hero}>
        <h1 className={styles.title}>{headline(t, final, rank)}</h1>
        {rank !== null && (
          <p className={styles.position}>
            {t.result.place} <strong className={styles.number}>{rank.rank}</strong>
            <span className={styles.total}>
              {t.result.of} {rank.total}
            </span>
          </p>
        )}
      </div>
      <ol className={styles.list}>
        {entries.map((entry, index) => (
          <RankingCard key={entry.nickname} rank={index + 1} {...entry} highlight={entry.nickname === nickname} />
        ))}
      </ol>
      {final && (
        <Link to="/" className={styles.home}>
          {t.status.home}
        </Link>
      )}
    </main>
  );
}

import { Link } from 'react-router';
import { RankingCard } from '../../components/RankingCard.js';
import { Wordmark } from '../../components/Wordmark.js';
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

function headline(final: boolean, rank: PlayerRank | null): string {
  if (!final) return 'Tu posición';
  return rank?.rank === 1 ? '¡Ganaste!' : 'Terminaste en';
}

export function ResultScreen({ final, entries, nickname, rank }: ResultScreenProps) {
  return (
    <main className={styles.screen}>
      <Wordmark size="s" />
      <div className={styles.hero}>
        <h1 className={styles.title}>{rank === null ? (final ? 'Fin de la partida' : 'Ranking') : headline(final, rank)}</h1>
        {rank !== null && (
          <p className={styles.position}>
            Puesto <strong className={styles.number}>{rank.rank}</strong>
            <span className={styles.total}>de {rank.total}</span>
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
          Volver al inicio
        </Link>
      )}
    </main>
  );
}

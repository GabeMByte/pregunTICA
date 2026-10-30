import type { PodiumEntry } from '@preguntica/shared';
import { Wordmark } from '../components/Wordmark.js';
import styles from './PodiumScreen.module.css';

const scoreFormat = new Intl.NumberFormat('es-CR');

export function PodiumScreen({ entries }: { entries: PodiumEntry[] }) {
  return (
    <main className={styles.page}>
      <Wordmark size="s" />
      <h1 className={styles.title}>¡Podio final!</h1>
      {entries.length === 0 ? (
        <p className={styles.empty}>Esta partida terminó sin jugadores.</p>
      ) : (
        <ol className={styles.podium}>
          {entries.map(({ rank, nickname, score }) => (
            <li key={nickname} className={styles.place} data-rank={rank}>
              <p className={styles.nickname}>{nickname}</p>
              <p className={styles.score}>{scoreFormat.format(score)}</p>
              <div className={styles.step} role="img" aria-label={`Puesto ${String(rank)}`}>
                {rank}
              </div>
            </li>
          ))}
        </ol>
      )}
      {/* A full load, not a route change: it starts a clean game with the session already cleared. */}
      <a className={styles.again} href="/host">
        Nueva partida
      </a>
    </main>
  );
}

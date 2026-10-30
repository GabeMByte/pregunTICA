import { OptionButton, type OptionState } from '../components/OptionButton.js';
import { RankingCard } from '../components/RankingCard.js';
import { StatusScreen } from '../components/StatusScreen.js';
import { Timer } from '../components/Timer.js';
import styles from './ComponentsPage.module.css';

const OPTIONS = ['Volcán Arenal', 'Volcán Poás', 'Volcán Irazú', 'Volcán Rincón de la Vieja'];
const REVEAL: OptionState[] = ['wrong', 'correct', 'dimmed', 'wrong'];
const RANKING = [
  { nickname: 'Pura Vida', score: 4_820, delta: 950 },
  { nickname: 'Mae Tuanis', score: 4_310, delta: 0 },
  { nickname: 'La Chinita', score: 3_975, delta: 720 },
  { nickname: 'Yo mero', score: 2_100, delta: 480 },
];
// Frozen clock so the screenshots are stable.
const FROZEN_NOW = 1_761_600_000_000;
const frozen = () => FROZEN_NOW;

/** Dev-only catalog of the shared components (SPEC §4 Interfaz), used for the visual review. */
export function ComponentsPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Componentes</h1>

      <section className={styles.section}>
        <h2 className={styles.heading}>Opciones · jugador</h2>
        <div className={styles.phoneGrid}>
          {OPTIONS.map((text, index) => (
            <OptionButton key={text} index={index} text={text} state={index === 1 ? 'selected' : 'idle'} onSelect={() => undefined} />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Opciones · revelación en proyector</h2>
        <div className={styles.projectorGrid}>
          {OPTIONS.map((text, index) => (
            <OptionButton key={text} index={index} text={text} state={REVEAL[index]} size="projector" />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Temporizador</h2>
        <div className={styles.row}>
          <Timer endsAt={FROZEN_NOW + 14_000} durationMs={20_000} now={frozen} />
          <Timer endsAt={FROZEN_NOW + 4_000} durationMs={20_000} now={frozen} />
          <Timer endsAt={FROZEN_NOW + 14_000} durationMs={20_000} now={frozen} size="projector" />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Ranking</h2>
        <ol className={styles.ranking}>
          {RANKING.map((entry, index) => (
            <RankingCard key={entry.nickname} rank={index + 1} {...entry} highlight={index === 3} />
          ))}
        </ol>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>Pantallas de estado</h2>
        <div className={styles.statusGrid}>
          <div className={styles.frame}>
            <StatusScreen kind="connecting" />
          </div>
          <div className={styles.frame}>
            <StatusScreen kind="disconnected" message="Intentando reconectar a la sala…" onRetry={() => undefined} />
          </div>
          <div className={styles.frame}>
            <StatusScreen kind="error" title="Sala no encontrada" message="Revisa el código e intenta de nuevo." showHome />
          </div>
        </div>
      </section>
    </main>
  );
}

import { Link } from 'react-router';
import { Wordmark } from '../components/Wordmark.js';
import styles from '../routes/Placeholder.module.css';

/** Placeholder until Day 5 part 2 builds the projector view on top of useHostGame. */
export function HostPage() {
  return (
    <main className={styles.page}>
      <Link to="/" className={styles.brand} aria-label="Volver al inicio">
        <Wordmark size="m" />
      </Link>
      <h1 className={styles.title}>Presentador</h1>
      <p className={styles.text}>Crea una sala y elige un tema.</p>
    </main>
  );
}

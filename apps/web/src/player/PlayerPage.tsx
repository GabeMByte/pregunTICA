import { RoomCodeSchema } from '@preguntica/shared';
import { Link, useParams } from 'react-router';
import { Wordmark } from '../components/Wordmark.js';
import styles from '../routes/Placeholder.module.css';

/** Placeholder until Day 5 part 2 builds the phone view on top of usePlayerGame. */
export function PlayerPage() {
  const { code } = useParams();
  // The code comes from the URL (the QR): validated like any other input.
  const roomCode = RoomCodeSchema.safeParse(code ?? '');

  return (
    <main className={styles.page}>
      <Link to="/" className={styles.brand} aria-label="Volver al inicio">
        <Wordmark size="s" />
      </Link>
      <h1 className={styles.title}>Unirme</h1>
      {roomCode.success ? (
        <p className={styles.text}>
          Sala <strong className={styles.code}>{roomCode.data}</strong>
        </p>
      ) : (
        <p className={styles.text}>Ingresa el código de la sala para unirte.</p>
      )}
    </main>
  );
}

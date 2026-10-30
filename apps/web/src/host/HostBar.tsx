import type { RoomStatePayload } from '@preguntica/shared';
import { Wordmark } from '../components/Wordmark.js';
import styles from './HostBar.module.css';

/** Keeps the room code in sight: late players can join during the game (SPEC §3). */
export function HostBar({ room }: { room: RoomStatePayload }) {
  const progress = room.questionIndex === null ? null : `Pregunta ${String(room.questionIndex + 1)} de ${String(room.totalQuestions)}`;
  return (
    <header className={styles.bar}>
      <Wordmark size="s" />
      <p className={styles.topic}>{room.topic}</p>
      {progress !== null && <p className={styles.progress}>{progress}</p>}
      <p className={styles.code}>
        Código <strong>{room.roomCode}</strong>
      </p>
    </header>
  );
}

/** Between room:state and the phase's own event: only for an instant. */
export function HostWaiting({ room }: { room: RoomStatePayload }) {
  return (
    <main className={styles.waiting}>
      <HostBar room={room} />
    </main>
  );
}

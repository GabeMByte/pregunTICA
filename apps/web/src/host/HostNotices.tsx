import styles from './HostNotices.module.css';

/** Stays on top of the game: a failed action must not take the projector away from the room. */
export function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className={[styles.notice, styles.error].join(' ')} role="alert">
      <p>{message}</p>
      <button type="button" className={styles.dismiss} onClick={onDismiss}>
        Cerrar
      </button>
    </div>
  );
}

export function ConnectionNotice() {
  return (
    <div className={styles.notice} role="status">
      <p>Reconectando…</p>
    </div>
  );
}

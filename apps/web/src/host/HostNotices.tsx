import { useT } from '../i18n/useT.js';
import styles from './HostNotices.module.css';

/** Stays on top of the game: a failed action must not take the projector away from the room. */
export function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const { t } = useT();
  return (
    <div className={[styles.notice, styles.error].join(' ')} role="alert">
      <p>{message}</p>
      <button type="button" className={styles.dismiss} onClick={onDismiss}>
        {t.host.close}
      </button>
    </div>
  );
}

export function ConnectionNotice() {
  const { t } = useT();
  return (
    <div className={styles.notice} role="status">
      <p>{t.host.reconnecting}</p>
    </div>
  );
}

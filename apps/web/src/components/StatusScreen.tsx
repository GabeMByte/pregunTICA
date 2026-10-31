import { Link } from 'react-router';
import { useT } from '../i18n/useT.js';
import { Wordmark } from './Wordmark.js';
import styles from './StatusScreen.module.css';

export type StatusKind = 'connecting' | 'disconnected' | 'error';

export interface StatusScreenProps {
  kind: StatusKind;
  title?: string;
  message?: string;
  onRetry?: () => void;
  /** Show a link back to the home page. */
  showHome?: boolean;
}

export function StatusScreen({ kind, title, message, onRetry, showHome = false }: StatusScreenProps) {
  const { t } = useT();
  return (
    <main className={[styles.screen, styles[kind]].join(' ')}>
      <Wordmark size="s" />
      <div className={styles.panel} role={kind === 'connecting' ? 'status' : 'alert'}>
        <span className={styles.icon} aria-hidden="true" />
        <h1 className={styles.title}>{title ?? t.status[kind]}</h1>
        {message !== undefined && <p className={styles.message}>{message}</p>}
      </div>
      {(onRetry !== undefined || showHome) && (
        <div className={styles.actions}>
          {onRetry !== undefined && (
            <button type="button" className={styles.primary} onClick={onRetry}>
              {t.status.retry}
            </button>
          )}
          {showHome && (
            <Link to="/" className={styles.secondary}>
              {t.status.home}
            </Link>
          )}
        </div>
      )}
    </main>
  );
}

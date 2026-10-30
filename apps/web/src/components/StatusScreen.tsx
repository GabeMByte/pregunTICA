import { Link } from 'react-router';
import { Wordmark } from './Wordmark.js';
import styles from './StatusScreen.module.css';

export type StatusKind = 'connecting' | 'disconnected' | 'error';

const DEFAULT_TITLES: Record<StatusKind, string> = {
  connecting: 'Conectando…',
  disconnected: 'Se perdió la conexión',
  error: 'Algo salió mal',
};

export interface StatusScreenProps {
  kind: StatusKind;
  title?: string;
  message?: string;
  onRetry?: () => void;
  /** Show a link back to the home page. */
  showHome?: boolean;
}

export function StatusScreen({ kind, title = DEFAULT_TITLES[kind], message, onRetry, showHome = false }: StatusScreenProps) {
  return (
    <main className={[styles.screen, styles[kind]].join(' ')}>
      <Wordmark size="s" />
      <div className={styles.panel} role={kind === 'connecting' ? 'status' : 'alert'}>
        <span className={styles.icon} aria-hidden="true" />
        <h1 className={styles.title}>{title}</h1>
        {message !== undefined && <p className={styles.message}>{message}</p>}
      </div>
      {(onRetry !== undefined || showHome) && (
        <div className={styles.actions}>
          {onRetry !== undefined && (
            <button type="button" className={styles.primary} onClick={onRetry}>
              Reintentar
            </button>
          )}
          {showHome && (
            <Link to="/" className={styles.secondary}>
              Volver al inicio
            </Link>
          )}
        </div>
      )}
    </main>
  );
}

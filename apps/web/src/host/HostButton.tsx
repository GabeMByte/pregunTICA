import type { ReactNode } from 'react';
import { useT } from '../i18n/useT.js';
import styles from './HostButton.module.css';

export interface HostButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  /** Tells the presenter that the keyboard works too. */
  showShortcut?: boolean;
}

export function HostButton({ children, onClick, disabled = false, type = 'button', showShortcut = false }: HostButtonProps) {
  const { t } = useT();
  return (
    <button type={type} className={styles.button} onClick={onClick} disabled={disabled}>
      {children}
      {showShortcut && !disabled && <kbd className={styles.key}>{t.host.shortcut}</kbd>}
    </button>
  );
}

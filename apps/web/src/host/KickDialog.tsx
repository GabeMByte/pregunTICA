import { useEffect, useRef } from 'react';
import { useT } from '../i18n/useT.js';
import styles from './KickDialog.module.css';

export interface KickDialogProps {
  nickname: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function KickDialog({ nickname, onConfirm, onCancel }: KickDialogProps) {
  const { t } = useT();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // A modal <dialog> traps focus, closes with Escape and starts on Cancel, the safe choice.
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog ref={dialogRef} className={styles.dialog} onCancel={onCancel} aria-labelledby="kick-title">
      <h2 id="kick-title" className={styles.title}>
        {t.kick.title(nickname)}
      </h2>
      <p className={styles.text}>{t.kick.text}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          {t.kick.cancel}
        </button>
        <button type="button" className={styles.confirm} onClick={onConfirm}>
          {t.kick.confirm}
        </button>
      </div>
    </dialog>
  );
}

import { useEffect, useRef } from 'react';
import styles from './KickDialog.module.css';

export interface KickDialogProps {
  nickname: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function KickDialog({ nickname, onConfirm, onCancel }: KickDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // A modal <dialog> traps focus, closes with Escape and starts on Cancelar, the safe choice.
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog ref={dialogRef} className={styles.dialog} onCancel={onCancel} aria-labelledby="kick-title">
      <h2 id="kick-title" className={styles.title}>
        ¿Expulsar a {nickname}?
      </h2>
      <p className={styles.text}>Sale de la sala. Si vuelve a entrar, lo hace como jugador nuevo.</p>
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className={styles.confirm} onClick={onConfirm}>
          Expulsar
        </button>
      </div>
    </dialog>
  );
}

import styles from './Wordmark.module.css';

/** The PregunTICA logotype; "TICA" (Costa Ricans' nickname) gets the accent color. */
export function Wordmark({ size = 'm' }: { size?: 's' | 'm' | 'l' }) {
  return (
    <span className={`${styles.wordmark} ${styles[size]}`}>
      Pregun<span className={styles.tica}>TICA</span>
    </span>
  );
}

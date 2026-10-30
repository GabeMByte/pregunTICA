import { Link } from 'react-router';
import { OptionShape } from '../components/OptionShape.js';
import { OPTION_SHAPES } from '../components/option-shapes.js';
import { Wordmark } from '../components/Wordmark.js';
import styles from './Home.module.css';

export function Home() {
  return (
    <main className={styles.page}>
      <div className={styles.shapes} aria-hidden="true">
        {OPTION_SHAPES.map((shape) => (
          <OptionShape key={shape} shape={shape} className={`${styles.shape} ${styles[shape]}`} />
        ))}
      </div>

      <header className={styles.hero}>
        <h1>
          <Wordmark size="l" />
        </h1>
        <p className={styles.tagline}>Trivia en vivo con preguntas creadas por IA sobre el tema que quieras.</p>
      </header>

      <nav className={styles.actions} aria-label="Empezar">
        <Link to="/host" className={`${styles.action} ${styles.primary}`}>
          <span className={styles.actionTitle}>Crear partida</span>
          <span className={styles.actionHint}>Para quien presenta en la pantalla grande</span>
        </Link>
        <Link to="/play" className={`${styles.action} ${styles.secondary}`}>
          <span className={styles.actionTitle}>Unirme</span>
          <span className={styles.actionHint}>Con el código de la sala, desde tu celular</span>
        </Link>
      </nav>
    </main>
  );
}

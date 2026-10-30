import { OptionShape } from '../../components/OptionShape.js';
import { OPTION_SHAPES } from '../../components/option-shapes.js';
import { Wordmark } from '../../components/Wordmark.js';
import styles from './LobbyScreen.module.css';

export interface LobbyScreenProps {
  nickname: string;
  topic: string;
  playerCount: number;
  /** Joined mid-game: plays from the next question. */
  waiting: boolean;
}

export function LobbyScreen({ nickname, topic, playerCount, waiting }: LobbyScreenProps) {
  return (
    <main className={styles.screen}>
      <Wordmark size="s" />
      <div className={styles.shapes} aria-hidden="true">
        {OPTION_SHAPES.map((shape) => (
          <OptionShape key={shape} shape={shape} className={`${styles.shape} ${styles[shape]}`} />
        ))}
      </div>
      <h1 className={styles.title}>Estás dentro</h1>
      <p className={styles.nickname}>{nickname}</p>
      <p className={styles.status} role="status">
        {waiting ? 'Espera a la siguiente pregunta' : 'Espera a que empiece la partida'}
      </p>
      <p className={styles.details}>
        {topic}
        <br />
        {playerCount === 1 ? '1 jugador en la sala' : `${String(playerCount)} jugadores en la sala`}
      </p>
    </main>
  );
}

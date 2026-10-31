import { OptionShape } from '../../components/OptionShape.js';
import { OPTION_SHAPES } from '../../components/option-shapes.js';
import { Wordmark } from '../../components/Wordmark.js';
import { LanguageSwitch } from '../../i18n/LanguageSwitch.js';
import { useT } from '../../i18n/useT.js';
import styles from './LobbyScreen.module.css';

export interface LobbyScreenProps {
  nickname: string;
  topic: string;
  playerCount: number;
  /** Joined mid-game: plays from the next question. */
  waiting: boolean;
}

export function LobbyScreen({ nickname, topic, playerCount, waiting }: LobbyScreenProps) {
  const { t } = useT();
  return (
    <main className={styles.screen}>
      {/* Waiting means a question is under way: no switch to tap by mistake. */}
      {!waiting && <LanguageSwitch className={styles.language} />}
      <Wordmark size="s" />
      <div className={styles.shapes} aria-hidden="true">
        {OPTION_SHAPES.map((shape) => (
          <OptionShape key={shape} shape={shape} className={`${styles.shape} ${styles[shape]}`} />
        ))}
      </div>
      <h1 className={styles.title}>{t.playerLobby.title}</h1>
      <p className={styles.nickname}>{nickname}</p>
      <p className={styles.status} role="status">
        {waiting ? t.playerLobby.waitNext : t.playerLobby.waitStart}
      </p>
      <p className={styles.details}>
        {topic}
        <br />
        {t.playerLobby.players(playerCount)}
      </p>
    </main>
  );
}

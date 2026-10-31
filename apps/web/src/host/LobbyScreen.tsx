import type { RoomStatePayload } from '@preguntica/shared';
import { useState } from 'react';
import { Wordmark } from '../components/Wordmark.js';
import type { Dictionary } from '../i18n/es.js';
import { LanguageSwitch } from '../i18n/LanguageSwitch.js';
import { useT } from '../i18n/useT.js';
import { HostButton } from './HostButton.js';
import { showsFallbackNotice } from './hostView.js';
import { KickDialog } from './KickDialog.js';
import styles from './LobbyScreen.module.css';
import { RoomQr } from './RoomQr.js';

export interface LobbyScreenProps {
  room: RoomStatePayload;
  url: string;
  canStart: boolean;
  onStart: () => void;
  onKick: (nickname: string) => void;
}

function startHint({ phase, players }: RoomStatePayload, t: Dictionary): string | null {
  if (phase === 'GENERATING') return t.lobby.generating;
  return players.length === 0 ? t.lobby.waiting : null;
}

export function LobbyScreen({ room, url, canStart, onStart, onKick }: LobbyScreenProps) {
  const { t } = useT();
  const [kicking, setKicking] = useState<string | null>(null);
  const hint = startHint(room, t);

  const closeDialog = () => {
    setKicking(null);
    // Focus returns to the nickname, and Space there would open the dialog instead of starting.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };

  return (
    <main className={styles.page}>
      <LanguageSwitch className={styles.language} />
      <section className={styles.join} aria-label={t.lobby.howToJoin}>
        <Wordmark size="s" />
        <RoomQr url={url} />
        <p className={styles.url}>{url.replace(/^https?:\/\//, '')}</p>
        <p className={styles.codeLabel}>{t.lobby.roomCode}</p>
        <p className={styles.code}>{room.roomCode}</p>
      </section>

      <section className={styles.room} aria-label={t.lobby.room}>
        <div className={styles.heading}>
          <p className={styles.topic}>{room.topic}</p>
          <h1 className={styles.title}>{t.lobby.players(room.players.length)}</h1>
        </div>

        {room.players.length === 0 ? (
          <p className={styles.empty}>{t.lobby.scan}</p>
        ) : (
          <div className={styles.list}>
            <p className={styles.help}>{t.lobby.kickHelp}</p>
            <ul className={styles.players}>
              {room.players.map(({ nickname }) => (
                <li key={nickname}>
                  <button
                    type="button"
                    className={styles.player}
                    aria-label={t.lobby.kick(nickname)}
                    onClick={() => {
                      setKicking(nickname);
                    }}
                  >
                    {nickname}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.footer}>
          {showsFallbackNotice(room) && <p className={styles.fallback}>{t.lobby.fallback}</p>}
          {hint !== null && (
            <p className={styles.hint} role="status">
              {hint}
            </p>
          )}
          <HostButton onClick={onStart} disabled={!canStart} showShortcut>
            {t.lobby.start}
          </HostButton>
        </div>
      </section>

      {kicking !== null && (
        <KickDialog
          nickname={kicking}
          onCancel={closeDialog}
          onConfirm={() => {
            onKick(kicking);
            closeDialog();
          }}
        />
      )}
    </main>
  );
}

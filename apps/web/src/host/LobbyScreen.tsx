import type { RoomStatePayload } from '@preguntica/shared';
import { useState } from 'react';
import { Wordmark } from '../components/Wordmark.js';
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

function startHint({ phase, players }: RoomStatePayload): string | null {
  if (phase === 'GENERATING') return 'Generando las preguntas…';
  return players.length === 0 ? 'Esperando jugadores…' : null;
}

export function LobbyScreen({ room, url, canStart, onStart, onKick }: LobbyScreenProps) {
  const [kicking, setKicking] = useState<string | null>(null);
  const hint = startHint(room);

  const closeDialog = () => {
    setKicking(null);
    // Focus returns to the nickname, and Space there would open the dialog instead of starting.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };

  return (
    <main className={styles.page}>
      <section className={styles.join} aria-label="Cómo unirse">
        <Wordmark size="s" />
        <RoomQr url={url} />
        <p className={styles.url}>{url.replace(/^https?:\/\//, '')}</p>
        <p className={styles.codeLabel}>Código de sala</p>
        <p className={styles.code}>{room.roomCode}</p>
      </section>

      <section className={styles.room} aria-label="Sala">
        <div className={styles.heading}>
          <p className={styles.topic}>{room.topic}</p>
          <h1 className={styles.title}>Jugadores: {room.players.length}</h1>
        </div>

        {room.players.length === 0 ? (
          <p className={styles.empty}>Escanea el código para entrar.</p>
        ) : (
          <div className={styles.list}>
            <p className={styles.help}>Haz clic en un apodo para expulsarlo.</p>
            <ul className={styles.players}>
              {room.players.map(({ nickname }) => (
                <li key={nickname}>
                  <button
                    type="button"
                    className={styles.player}
                    aria-label={`Expulsar a ${nickname}`}
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
          {showsFallbackNotice(room) && <p className={styles.fallback}>Preguntas de respaldo: la IA no respondió.</p>}
          {hint !== null && (
            <p className={styles.hint} role="status">
              {hint}
            </p>
          )}
          <HostButton onClick={onStart} disabled={!canStart} showShortcut>
            Iniciar
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

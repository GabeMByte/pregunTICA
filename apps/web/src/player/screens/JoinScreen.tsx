import { NICKNAME_MAX_LENGTH, NicknameSchema, ROOM_CODE_LENGTH, RoomCodeSchema } from '@preguntica/shared';
import type { GameError } from '../../game/requests.js';
import { useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';
import { Wordmark } from '../../components/Wordmark.js';
import { errorText } from '../../i18n/errors.js';
import { useT } from '../../i18n/useT.js';
import { joinErrorField } from '../player-view.js';
import styles from './JoinScreen.module.css';

const INVALID_CODE = `El código tiene ${String(ROOM_CODE_LENGTH)} letras y números.`;
const INVALID_NICKNAME = `Escribe un apodo de hasta ${String(NICKNAME_MAX_LENGTH)} caracteres.`;

export interface JoinScreenProps {
  initialRoomCode: string;
  initialNickname: string;
  error: GameError | null;
  connected: boolean;
  joining: boolean;
  onJoin: (roomCode: string, nickname: string) => void;
  onDismissError: () => void;
}

export function JoinScreen({ initialRoomCode, initialNickname, error, connected, joining, onJoin, onDismissError }: JoinScreenProps) {
  const { t } = useT();
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [nickname, setNickname] = useState(initialNickname);
  const [invalid, setInvalid] = useState({ roomCode: false, nickname: false });

  const serverField = error === null ? null : joinErrorField(error.code);
  const serverMessage = error === null ? null : errorText(t, error, t.joinErrors);
  const codeError = invalid.roomCode ? INVALID_CODE : serverField === 'roomCode' ? serverMessage : null;
  const nicknameError = invalid.nickname ? INVALID_NICKNAME : serverField === 'nickname' ? serverMessage : null;
  const formError = serverField === 'form' ? serverMessage : null;

  const onEdit = () => {
    setInvalid({ roomCode: false, nickname: false });
    if (error !== null) onDismissError();
  };

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    const code = RoomCodeSchema.safeParse(roomCode);
    const name = NicknameSchema.safeParse(nickname);
    if (code.success && name.success) onJoin(code.data, name.data);
    else setInvalid({ roomCode: !code.success, nickname: !name.success });
  };

  return (
    <main className={styles.screen}>
      <Link to="/" className={styles.brand} aria-label="Volver al inicio">
        <Wordmark size="s" />
      </Link>
      <header className={styles.header}>
        <h1 className={styles.title}>Unirme</h1>
        <p className={styles.hint}>{initialRoomCode === '' ? 'Ingresa el código de la sala para unirte.' : 'Elige tu apodo para entrar a la sala.'}</p>
      </header>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="join-code">
            Código de sala
          </label>
          <input
            id="join-code"
            className={`${styles.input} ${styles.code}`}
            value={roomCode}
            onChange={(event) => {
              setRoomCode(event.target.value.toUpperCase());
              onEdit();
            }}
            maxLength={ROOM_CODE_LENGTH}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={codeError !== null}
            aria-describedby={codeError === null ? undefined : 'join-code-error'}
          />
          {codeError !== null && (
            <span id="join-code-error" className={styles.error} role="alert">
              {codeError}
            </span>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="join-nickname">
            Tu apodo
          </label>
          <input
            id="join-nickname"
            className={styles.input}
            value={nickname}
            onChange={(event) => {
              setNickname(event.target.value);
              onEdit();
            }}
            maxLength={NICKNAME_MAX_LENGTH}
            autoComplete="nickname"
            enterKeyHint="go"
            aria-invalid={nicknameError !== null}
            aria-describedby={nicknameError === null ? undefined : 'join-nickname-error'}
          />
          {nicknameError !== null && (
            <span id="join-nickname-error" className={styles.error} role="alert">
              {nicknameError}
            </span>
          )}
        </div>

        {formError !== null && (
          <p className={styles.error} role="alert">
            {formError}
          </p>
        )}

        <button type="submit" className={styles.submit} disabled={!connected || joining}>
          {connected ? (joining ? 'Entrando…' : 'Entrar') : 'Conectando…'}
        </button>
      </form>
    </main>
  );
}

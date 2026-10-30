import { RoomCodeSchema } from '@preguntica/shared';
import { useParams } from 'react-router';
import { StatusScreen } from '../components/StatusScreen.js';
import type { GameSocket } from '../net/socket.js';
import { playerScreen } from './player-view.js';
import { JoinScreen } from './screens/JoinScreen.js';
import { LobbyScreen } from './screens/LobbyScreen.js';
import { QuestionScreen } from './screens/QuestionScreen.js';
import { usePlayerGame } from './usePlayerGame.js';

export interface PlayerPageProps {
  /** Must be stable across renders. */
  createSocket?: () => GameSocket;
}

/** The phone view: picks the screen for the current state; the game state lives in usePlayerGame. */
export function PlayerPage({ createSocket }: PlayerPageProps) {
  const { code } = useParams();
  // The code comes from the URL (the QR): validated like any other input.
  const parsedCode = RoomCodeSchema.safeParse(code ?? '');
  const urlRoomCode = parsedCode.success ? parsedCode.data : undefined;
  const { state, join, answer, dismissError, retry } = usePlayerGame({ createSocket, urlRoomCode });
  const { session, room, question, error } = state;
  const screen = playerScreen(state);

  if (screen === 'join') {
    return (
      <JoinScreen
        initialRoomCode={urlRoomCode ?? session?.roomCode ?? ''}
        initialNickname={session?.nickname ?? ''}
        error={error}
        connected={state.connection === 'connected'}
        joining={state.joining}
        onJoin={join}
        onDismissError={dismissError}
      />
    );
  }
  if (screen === 'kicked') {
    return <StatusScreen kind="error" title="Te sacaron de la sala" message="Ya no participas en esta partida." showHome />;
  }
  if (screen === 'reconnecting') {
    return <StatusScreen kind="disconnected" message="Intentando volver a tu partida…" onRetry={retry} />;
  }
  if (screen === 'connecting') return <StatusScreen kind="connecting" />;

  if (screen === 'lobby' && session !== null && room !== null) {
    return <LobbyScreen nickname={session.nickname} topic={room.topic} playerCount={room.players.length} waiting={state.waitingForNextQuestion} />;
  }
  if (screen === 'question' && question !== null) {
    return <QuestionScreen key={question.index} question={question} selectedOption={state.selectedOption} onAnswer={answer} />;
  }
  // Between room:state and the data of the new phase.
  return <StatusScreen kind="connecting" title="Prepárate…" />;
}

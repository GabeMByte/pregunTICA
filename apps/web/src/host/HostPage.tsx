import { useState } from 'react';
import { StatusScreen } from '../components/StatusScreen.js';
import { shareableOrigin } from '../net/lan.js';
import { HostWaiting } from './HostBar.js';
import { HostForm } from './HostForm.js';
import { errorMessage } from './hostMessages.js';
import { ConnectionNotice, ErrorToast } from './HostNotices.js';
import { canStart, EMPTY_DRAFT, joinUrl, selectHostScreen, type HostScreen } from './hostView.js';
import { LeaderboardScreen } from './LeaderboardScreen.js';
import { LobbyScreen } from './LobbyScreen.js';
import { PodiumScreen } from './PodiumScreen.js';
import { QuestionScreen } from './QuestionScreen.js';
import { RevealScreen } from './RevealScreen.js';
import { useAdvanceShortcut } from './useAdvanceShortcut.js';
import { useHostGame, type UseHostGameOptions } from './useHostGame.js';

/** The projector view: picks the screen for the phase; the game state lives in useHostGame. */
export function HostPage({ options }: { options?: UseHostGameOptions }) {
  const { state, create, advance, kick, dismissError } = useHostGame(options);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  useAdvanceShortcut(advance);

  const connected = state.connection === 'connected';
  const error = state.error === null ? null : errorMessage(state.error);

  const render = (screen: HostScreen) => {
    switch (screen.name) {
      case 'form':
        return <HostForm draft={draft} onDraftChange={setDraft} onCreate={create} connected={connected} creating={state.creating} error={error} />;
      case 'recovering':
        return <StatusScreen kind="connecting" title="Recuperando tu sala…" />;
      case 'waiting':
        return <HostWaiting room={screen.room} />;
      case 'lobby':
        return (
          <LobbyScreen
            room={screen.room}
            url={joinUrl(shareableOrigin(window.location, import.meta.env.VITE_LAN_HOST), screen.room.roomCode)}
            canStart={canStart(state)}
            onStart={advance}
            onKick={kick}
          />
        );
      case 'question':
        return <QuestionScreen key={screen.question.index} room={screen.room} question={screen.question} />;
      case 'reveal':
        return <RevealScreen room={screen.room} reveal={screen.reveal} onNext={advance} disabled={!connected} />;
      case 'leaderboard':
        return <LeaderboardScreen room={screen.room} entries={screen.entries} onNext={advance} disabled={!connected} />;
      case 'podium':
        return <PodiumScreen entries={screen.entries} />;
    }
  };

  const screen = selectHostScreen(state);
  const inGame = screen.name !== 'form' && screen.name !== 'podium';

  return (
    <>
      {render(screen)}
      {inGame && !connected && <ConnectionNotice />}
      {screen.name !== 'form' && error !== null && <ErrorToast message={error} onDismiss={dismissError} />}
    </>
  );
}

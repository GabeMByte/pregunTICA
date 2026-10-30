import { ClientEvents, ServerEvents } from '@preguntica/shared';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { SESSION_ENDING_ERRORS } from '../game/game-state.js';
import { createGameSocket, subscribe, type GameSocket } from '../net/socket.js';
import { clearPlayerSession, readPlayerSession, savePlayerSession } from '../net/storage.js';
import { canAnswer, initialPlayerState, playerReducer } from './playerReducer.js';

export interface UsePlayerGameOptions {
  /** Must be stable across renders: a new function reconnects. */
  createSocket?: () => GameSocket;
  getStorage?: () => Storage;
  /** SPEC §5: the playerId is generated on the device. */
  newPlayerId?: () => string;
  /** The room the link points to: a stored session from another room must not hijack a new QR. */
  urlRoomCode?: string;
}

const randomPlayerId = () => crypto.randomUUID();

/** All of the player view's game state (CLAUDE.md: one hook per view). */
export function usePlayerGame({ createSocket = createGameSocket, getStorage, newPlayerId = randomPlayerId, urlRoomCode }: UsePlayerGameOptions = {}) {
  const [state, dispatch] = useReducer(playerReducer, null, () => initialPlayerState(resumableSession(urlRoomCode, getStorage)));
  const socketRef = useRef<GameSocket | null>(null);
  /** The room of the last join sent; player:joined does not repeat it. */
  const joiningRoomRef = useRef<string | null>(null);
  /** Guards the emit itself: two taps can land before the re-render that disables the buttons. */
  const answeredRef = useRef<number | null>(null);

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    const onConnect = () => {
      dispatch({ type: 'connection', status: 'connected' });
      // A reload or a dropped connection: join again as the same player.
      const session = resumableSession(urlRoomCode, getStorage);
      if (session !== null) {
        joiningRoomRef.current = session.roomCode;
        socket.emit(ClientEvents.PlayerJoin, session);
      }
    };
    const onDisconnect = () => {
      dispatch({ type: 'connection', status: 'disconnected' });
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    const unsubscribers = [
      subscribe(socket, ServerEvents.PlayerJoined, (payload) => {
        const roomCode = joiningRoomRef.current;
        if (roomCode === null) return;
        savePlayerSession({ roomCode, playerId: payload.playerId, nickname: payload.nickname }, getStorage);
        dispatch({ type: 'player:joined', payload, roomCode });
      }),
      subscribe(socket, ServerEvents.RoomState, (payload) => {
        dispatch({ type: 'room:state', payload });
      }),
      subscribe(socket, ServerEvents.QuestionStart, (payload) => {
        dispatch({ type: 'question:start', payload });
      }),
      subscribe(socket, ServerEvents.QuestionReveal, (payload) => {
        dispatch({ type: 'question:reveal', payload });
      }),
      subscribe(socket, ServerEvents.Leaderboard, (payload) => {
        dispatch({ type: 'leaderboard', payload });
      }),
      subscribe(socket, ServerEvents.GameEnd, (payload) => {
        clearPlayerSession(getStorage);
        dispatch({ type: 'game:end', payload });
      }),
      subscribe(socket, ServerEvents.Error, (payload) => {
        if (SESSION_ENDING_ERRORS.includes(payload.code)) clearPlayerSession(getStorage);
        dispatch({ type: 'error', payload });
      }),
    ];
    socket.connect();

    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [createSocket, getStorage, urlRoomCode]);

  const join = useCallback(
    (roomCode: string, nickname: string) => {
      // Same room again (e.g. after "room full"): keep the id so the server sees the same player.
      const stored = readPlayerSession(getStorage);
      const playerId = stored?.roomCode === roomCode ? stored.playerId : newPlayerId();
      joiningRoomRef.current = roomCode;
      dispatch({ type: 'joining' });
      socketRef.current?.emit(ClientEvents.PlayerJoin, { roomCode, nickname, playerId });
    },
    [getStorage, newPlayerId],
  );

  const roomCode = state.session?.roomCode;
  const questionIndex = state.question?.index;
  const answerable = canAnswer(state);

  const answer = useCallback(
    (optionIndex: number) => {
      if (!answerable || roomCode === undefined || questionIndex === undefined) return;
      if (answeredRef.current === questionIndex) return;
      answeredRef.current = questionIndex;
      socketRef.current?.emit(ClientEvents.PlayerAnswer, { roomCode, questionIndex, optionIndex });
      dispatch({ type: 'answer', optionIndex });
    },
    [answerable, roomCode, questionIndex],
  );

  const dismissError = useCallback(() => {
    dispatch({ type: 'error:dismiss' });
  }, []);

  /** Socket.io retries a dropped connection on its own, but not one the server closed. */
  const retry = useCallback(() => {
    socketRef.current?.connect();
  }, []);

  return { state, join, answer, dismissError, retry };
}

function resumableSession(urlRoomCode: string | undefined, getStorage: UsePlayerGameOptions['getStorage']) {
  const session = readPlayerSession(getStorage);
  return urlRoomCode === undefined || session?.roomCode === urlRoomCode ? session : null;
}

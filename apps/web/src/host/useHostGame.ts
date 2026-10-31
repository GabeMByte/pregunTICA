import { ClientEvents, ServerEvents, type ClientToServerEvents } from '@preguntica/shared';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createRequestTimer, NO_RESPONSE, SEND_FAILED } from '../game/requests.js';
import { createGameSocket, subscribe, type GameSocket } from '../net/socket.js';
import { clearHostSession, readHostSession, saveHostSession } from '../net/storage.js';
import { HOST_SESSION_ENDING_ERRORS, hostReducer, initialHostState } from './hostReducer.js';
import { canStart } from './hostView.js';

export { REQUEST_TIMEOUT_MS } from '../game/requests.js';

export type CreateRoomInput = Parameters<ClientToServerEvents[typeof ClientEvents.HostCreate]>[0];

export interface UseHostGameOptions {
  /** Must be stable across renders: a new function reconnects. */
  createSocket?: () => GameSocket;
  getStorage?: () => Storage;
}

/** All of the host view's game state (CLAUDE.md: one hook per view). */
export function useHostGame({ createSocket = createGameSocket, getStorage }: UseHostGameOptions = {}) {
  const [state, dispatch] = useReducer(hostReducer, null, () => initialHostState(readHostSession(getStorage)));
  const socketRef = useRef<GameSocket | null>(null);
  /** From sending host:rejoin until the room comes back: the only moment NOT_HOST means the room is gone. */
  const rejoiningRef = useRef(false);
  /** The step the last advance was sent for: next is valid in two phases in a row, so a double press would skip one. */
  const advancedStepRef = useRef<string | null>(null);
  /** A create the server never answers must end in an error, not in "Creando…" forever. */
  const [createTimer] = useState(() =>
    createRequestTimer(() => {
      dispatch({ type: 'error', payload: NO_RESPONSE });
    }),
  );

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    const onConnect = () => {
      dispatch({ type: 'connection', status: 'connected' });
      advancedStepRef.current = null;
      // A reload or a dropped connection: take the room back with the stored token.
      const session = readHostSession(getStorage);
      rejoiningRef.current = session !== null;
      if (session !== null) socket.emit(ClientEvents.HostRejoin, session);
    };
    const onDisconnect = (reason: string) => {
      createTimer.settle();
      dispatch({ type: 'connection', status: 'disconnected' });
      // Socket.io retries every other reason on its own. Without this, a host whose topic was
      // rejected (the server closes the room's sockets) could not try another one.
      if (reason === 'io server disconnect') socket.connect();
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    const unsubscribers = [
      subscribe(socket, ServerEvents.HostCreated, (payload) => {
        createTimer.settle();
        saveHostSession(payload, getStorage);
        dispatch({ type: 'host:created', payload });
      }),
      subscribe(socket, ServerEvents.RoomState, (payload) => {
        rejoiningRef.current = false;
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
        clearHostSession(getStorage);
        dispatch({ type: 'game:end', payload });
      }),
      subscribe(socket, ServerEvents.Error, (payload) => {
        createTimer.settle();
        advancedStepRef.current = null;
        // The server answers a rejoin with NOT_HOST for a room that no longer exists too.
        const error = payload.code === 'NOT_HOST' && rejoiningRef.current ? { ...payload, code: 'ROOM_NOT_FOUND' as const } : payload;
        rejoiningRef.current = false;
        if (HOST_SESSION_ENDING_ERRORS.includes(error.code)) clearHostSession(getStorage);
        dispatch({ type: 'error', payload: error });
      }),
    ];
    socket.connect();

    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
      createTimer.settle();
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [createSocket, getStorage, createTimer]);

  const roomCode = state.session?.roomCode;

  const create = useCallback(
    (input: CreateRoomInput) => {
      if (state.creating) return;
      try {
        const socket = socketRef.current;
        if (socket === null) throw new Error('No socket to send host:create');
        dispatch({ type: 'create' });
        socket.emit(ClientEvents.HostCreate, input);
        createTimer.start();
      } catch (error) {
        // Shown on the form: a tap on "Crear sala" never fails in silence.
        console.error('Could not send host:create', error);
        createTimer.settle();
        dispatch({ type: 'error', payload: SEND_FAILED });
      }
    },
    [state.creating, createTimer],
  );

  const start = useCallback(() => {
    if (roomCode !== undefined) socketRef.current?.emit(ClientEvents.HostStart, { roomCode });
  }, [roomCode]);

  const next = useCallback(() => {
    if (roomCode !== undefined) socketRef.current?.emit(ClientEvents.HostNext, { roomCode });
  }, [roomCode]);

  const kick = useCallback(
    (nickname: string) => {
      if (roomCode !== undefined) socketRef.current?.emit(ClientEvents.HostKick, { roomCode, nickname });
    },
    [roomCode],
  );

  const startable = canStart(state);
  const phase = state.connection === 'connected' ? state.room?.phase : undefined;
  const step = `${String(phase)}:${String(state.room?.questionIndex)}`;

  /** The one way forward, for the buttons and the keyboard: start in the lobby, next after that. */
  const advance = useCallback(() => {
    if (advancedStepRef.current === step) return;
    if (phase === 'LOBBY' && startable) start();
    else if (phase === 'REVEAL' || phase === 'LEADERBOARD') next();
    else return;
    advancedStepRef.current = step;
  }, [next, phase, start, startable, step]);

  const dismissError = useCallback(() => {
    dispatch({ type: 'error:dismiss' });
  }, []);

  return { state, create, start, next, advance, kick, dismissError };
}

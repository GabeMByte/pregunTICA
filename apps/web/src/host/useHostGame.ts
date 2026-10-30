import { ClientEvents, ServerEvents, type ClientToServerEvents } from '@preguntica/shared';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { SESSION_ENDING_ERRORS } from '../game/game-state.js';
import { createGameSocket, subscribe, type GameSocket } from '../net/socket.js';
import { clearHostSession, readHostSession, saveHostSession } from '../net/storage.js';
import { hostReducer, initialHostState } from './hostReducer.js';

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

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    const onConnect = () => {
      dispatch({ type: 'connection', status: 'connected' });
      // A reload or a dropped connection: take the room back with the stored token.
      const session = readHostSession(getStorage);
      if (session !== null) socket.emit(ClientEvents.HostRejoin, session);
    };
    const onDisconnect = () => {
      dispatch({ type: 'connection', status: 'disconnected' });
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    const unsubscribers = [
      subscribe(socket, ServerEvents.HostCreated, (payload) => {
        saveHostSession(payload, getStorage);
        dispatch({ type: 'host:created', payload });
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
        clearHostSession(getStorage);
        dispatch({ type: 'game:end', payload });
      }),
      subscribe(socket, ServerEvents.Error, (payload) => {
        if (SESSION_ENDING_ERRORS.includes(payload.code)) clearHostSession(getStorage);
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
  }, [createSocket, getStorage]);

  const roomCode = state.session?.roomCode;

  const create = useCallback((input: CreateRoomInput) => {
    socketRef.current?.emit(ClientEvents.HostCreate, input);
  }, []);

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

  const dismissError = useCallback(() => {
    dispatch({ type: 'error:dismiss' });
  }, []);

  return { state, create, start, next, kick, dismissError };
}

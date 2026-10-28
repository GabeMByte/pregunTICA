import type { z } from 'zod';
import {
  HostCreatePayloadSchema,
  HostNextPayloadSchema,
  HostRejoinPayloadSchema,
  HostStartPayloadSchema,
  PlayerAnswerPayloadSchema,
  PlayerJoinPayloadSchema,
  type ErrorCode,
} from '@preguntica/shared';
import type { GameState } from '../engine/index.js';
import type { RoomChange, RoomRegistry } from '../rooms/room-registry.js';
import { getClientIp } from './client-ip.js';
import { eventsForTransition, snapshotFor, type Message, type Target, type Viewer } from './transitions.js';
import type { Emitter, GameServer, GameSocket } from './types.js';

export interface HandlerOptions {
  /** Read the client IP from X-Forwarded-For (only behind a trusted proxy). */
  trustProxy: boolean;
  /** Used when player:join comes without a playerId. */
  newPlayerId: () => string;
}

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_PAYLOAD: 'Los datos enviados no son válidos.',
  ROOM_NOT_FOUND: 'No existe una sala con ese código.',
  PLAYER_NOT_FOUND: 'No formas parte de esta sala.',
  ROOM_FULL: 'La sala está llena.',
  NICKNAME_TAKEN: 'Ese apodo ya está en uso en la sala.',
  NOT_HOST: 'Solo el presentador puede hacer esto.',
  INVALID_PHASE: 'Esa acción no está disponible en este momento.',
  QUESTIONS_NOT_READY: 'Las preguntas todavía se están generando.',
  NO_PLAYERS: 'Se necesita al menos un jugador conectado.',
  RATE_LIMITED: 'Creaste demasiadas salas. Espera unos minutos.',
  INTERNAL: 'Ocurrió un error inesperado.',
};

const roomChannel = (roomCode: string) => `room:${roomCode}`;
const hostChannel = (roomCode: string) => `host:${roomCode}`;
const playerChannel = (roomCode: string, playerId: string) => `player:${roomCode}:${playerId}`;
const playerKey = (roomCode: string, playerId: string) => `${roomCode}:${playerId}`;

function channelFor(roomCode: string, target: Target): string {
  switch (target.kind) {
    case 'room':
      return roomChannel(roomCode);
    case 'host':
      return hostChannel(roomCode);
    case 'player':
      return playerChannel(roomCode, target.playerId);
  }
}

/** Emits a typed message; the switch lets TypeScript pair each event with its payload. */
function send(to: Emitter, message: Message): void {
  switch (message.event) {
    case 'host:created':
      to.emit(message.event, message.payload);
      break;
    case 'player:joined':
      to.emit(message.event, message.payload);
      break;
    case 'room:state':
      to.emit(message.event, message.payload);
      break;
    case 'question:start':
      to.emit(message.event, message.payload);
      break;
    case 'question:reveal':
      to.emit(message.event, message.payload);
      break;
    case 'leaderboard':
      to.emit(message.event, message.payload);
      break;
    case 'game:end':
      to.emit(message.event, message.payload);
      break;
    case 'error':
      to.emit(message.event, message.payload);
      break;
  }
}

/** Wire as RoomRegistry's onChange: fans a state change out to the right sockets. */
export function broadcastChange(io: GameServer, { roomCode, previous, next }: RoomChange): void {
  for (const { to, ...message } of eventsForTransition(previous, next)) {
    send(io.to(channelFor(roomCode, to)), message);
  }
}

/** Wire as RoomRegistry's onGenerationError: tells only the host; the room stays in GENERATING. */
export function notifyGenerationError(io: GameServer, roomCode: string): void {
  send(io.to(hostChannel(roomCode)), { event: 'error', payload: { code: 'INTERNAL', message: ERROR_MESSAGES.INTERNAL } });
}

/** Thin layer: validate with Zod, authorize with socket.data, delegate to the registry/engine. */
export function registerHandlers(io: GameServer, registry: RoomRegistry, options: HandlerOptions): void {
  // Latest socket bound to each player wins; older sockets lose that identity.
  const playerSockets = new Map<string, string>();

  io.on('connection', (socket: GameSocket) => {
    const self = io.to(socket.id);

    const fail = (code: ErrorCode): void => {
      send(self, { event: 'error', payload: { code, message: ERROR_MESSAGES[code] } });
    };

    const parse = <S extends z.ZodType>(schema: S, raw: unknown): z.output<S> | null => {
      const result = schema.safeParse(raw);
      if (result.success) return result.data;
      fail('INVALID_PAYLOAD');
      return null;
    };

    /** Socket.io runs listeners outside any try/catch: an uncaught throw would kill the whole process. */
    const guard =
      <A extends unknown[]>(listener: (...args: A) => void) =>
      (...args: A): void => {
        try {
          listener(...args);
        } catch (error) {
          console.error('Socket handler failed', error);
          fail('INTERNAL');
        }
      };

    const sendSnapshot = (state: GameState, viewer: Viewer): void => {
      for (const message of snapshotFor(state, viewer)) send(self, message);
    };

    /**
     * Drops this socket's current identity. If it was still the latest socket of a player, that player
     * is disconnected in the engine too, so one socket can never leave "connected" ghosts behind.
     */
    const unbind = (): void => {
      const { role, roomCode, playerId } = socket.data;
      if (roomCode !== undefined) {
        void socket.leave(roomChannel(roomCode));
        void socket.leave(hostChannel(roomCode));
        if (role === 'player' && playerId !== undefined) {
          void socket.leave(playerChannel(roomCode, playerId));
          if (currentPlayerIn(roomCode) === playerId) {
            playerSockets.delete(playerKey(roomCode, playerId));
            registry.dispatch(roomCode, { type: 'disconnect', playerId });
          }
        }
      }
      socket.data = {};
    };

    const bindHost = (roomCode: string): void => {
      unbind();
      socket.data = { role: 'host', roomCode };
      void socket.join([roomChannel(roomCode), hostChannel(roomCode)]);
    };

    const bindPlayer = (roomCode: string, playerId: string): void => {
      // Re-joining as the same player from the same socket: already bound, nothing to disconnect.
      if (currentPlayerIn(roomCode) === playerId) return;
      unbind();
      const key = playerKey(roomCode, playerId);
      const previousSocket = playerSockets.get(key);
      if (previousSocket !== undefined && previousSocket !== socket.id) {
        io.in(previousSocket).socketsLeave([roomChannel(roomCode), playerChannel(roomCode, playerId)]);
      }
      playerSockets.set(key, socket.id);
      socket.data = { role: 'player', roomCode, playerId };
      void socket.join([roomChannel(roomCode), playerChannel(roomCode, playerId)]);
    };

    const isHostOf = (roomCode: string): boolean => socket.data.role === 'host' && socket.data.roomCode === roomCode;

    /** The player this socket currently speaks for in `roomCode`, if it is still the latest one. */
    const currentPlayerIn = (roomCode: string): string | null => {
      const { role, roomCode: bound, playerId } = socket.data;
      if (role !== 'player' || bound !== roomCode || playerId === undefined) return null;
      return playerSockets.get(playerKey(roomCode, playerId)) === socket.id ? playerId : null;
    };

    socket.on('host:create', guard((raw: unknown) => {
      const payload = parse(HostCreatePayloadSchema, raw);
      if (payload === null) return;
      const result = registry.create(payload, getClientIp(socket.handshake, options.trustProxy));
      if (!result.ok) {
        fail(result.error);
        return;
      }
      bindHost(result.roomCode);
      send(self, { event: 'host:created', payload: { roomCode: result.roomCode, hostToken: result.hostToken } });
      const state = registry.get(result.roomCode);
      if (state !== undefined) sendSnapshot(state, { role: 'host' });
    }));

    socket.on('host:rejoin', guard((raw: unknown) => {
      const payload = parse(HostRejoinPayloadSchema, raw);
      if (payload === null) return;
      const state = registry.get(payload.roomCode);
      if (state === undefined || !registry.verifyHost(payload.roomCode, payload.hostToken)) {
        fail('NOT_HOST');
        return;
      }
      bindHost(payload.roomCode);
      sendSnapshot(state, { role: 'host' });
    }));

    const hostAction = (type: 'start' | 'next', roomCode: string): void => {
      if (!isHostOf(roomCode)) {
        fail('NOT_HOST');
        return;
      }
      const result = registry.dispatch(roomCode, { type });
      if (!result.ok) fail(result.error);
    };

    socket.on('host:start', guard((raw: unknown) => {
      const payload = parse(HostStartPayloadSchema, raw);
      if (payload !== null) hostAction('start', payload.roomCode);
    }));

    socket.on('host:next', guard((raw: unknown) => {
      const payload = parse(HostNextPayloadSchema, raw);
      if (payload !== null) hostAction('next', payload.roomCode);
    }));

    socket.on('player:join', guard((raw: unknown) => {
      const payload = parse(PlayerJoinPayloadSchema, raw);
      if (payload === null) return;
      const playerId = payload.playerId ?? options.newPlayerId();
      const result = registry.dispatch(payload.roomCode, { type: 'join', playerId, nickname: payload.nickname });
      if (!result.ok) {
        fail(result.error);
        return;
      }
      bindPlayer(payload.roomCode, playerId);
      sendSnapshot(result.state, { role: 'player', playerId });
    }));

    socket.on('player:answer', guard((raw: unknown) => {
      const payload = parse(PlayerAnswerPayloadSchema, raw);
      if (payload === null) return;
      // The player id always comes from the socket binding, never from the payload.
      const playerId = currentPlayerIn(payload.roomCode);
      if (playerId === null) {
        fail('PLAYER_NOT_FOUND');
        return;
      }
      const result = registry.dispatch(payload.roomCode, {
        type: 'answer',
        playerId,
        questionIndex: payload.questionIndex,
        optionIndex: payload.optionIndex,
      });
      if (!result.ok) fail(result.error);
    }));

    // A disconnected host changes nothing in the engine: timers keep running and the room waits in REVEAL.
    socket.on('disconnect', guard(unbind));
  });
}

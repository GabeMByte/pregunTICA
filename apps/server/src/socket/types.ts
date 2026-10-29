import type { BroadcastOperator, DefaultEventsMap, Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@preguntica/shared';

/** Who a socket is, set by host:create / host:rejoin / player:join. Never trusted from payloads. */
export interface SocketData {
  role?: 'host' | 'player';
  roomCode?: string;
  playerId?: string;
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>;
export type Emitter = BroadcastOperator<ServerToClientEvents, SocketData>;

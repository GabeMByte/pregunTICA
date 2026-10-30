import {
  serverPayloadSchemas,
  type ClientToServerEvents,
  type ServerEvent,
  type ServerToClientEvents,
} from '@preguntica/shared';
import { io, type Socket } from 'socket.io-client';
import type { z } from 'zod';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Same origin: Vite proxies /socket.io to the server in dev, the server serves the app in prod. */
export function createGameSocket(): GameSocket {
  return io({ autoConnect: false });
}

export type ServerPayload<E extends ServerEvent> = z.output<(typeof serverPayloadSchemas)[E]>;

// A mapped view of the shared schemas, so indexing with a generic event keeps its payload type.
const schemas: { [E in ServerEvent]: z.ZodType<ServerPayload<E>> } = serverPayloadSchemas;

/** A payload that broke the contract: dropped before it reaches any state. */
export interface ProtocolError {
  event: ServerEvent;
  issues: z.core.$ZodIssue[];
}

function reportProtocolError(error: ProtocolError) {
  console.error('Protocol error: invalid payload from server', error);
}

/**
 * Listens to a server event, validating every payload with its shared Zod schema (CLAUDE.md rule 3).
 * Returns a function that stops listening.
 */
export function subscribe<E extends ServerEvent>(
  socket: GameSocket,
  event: E,
  handler: (payload: ServerPayload<E>) => void,
  onProtocolError: (error: ProtocolError) => void = reportProtocolError,
): () => void {
  const schema = schemas[event];
  const listener = (payload: unknown) => {
    const result = schema.safeParse(payload);
    if (result.success) handler(result.data);
    else onProtocolError({ event, issues: result.error.issues });
  };
  // Socket.io cannot narrow its listener type for a generic event name; the payload is unknown until parsed anyway.
  const raw = socket as unknown as RawSocket;
  raw.on(event, listener);
  return () => {
    raw.off(event, listener);
  };
}

interface RawSocket {
  on(event: string, listener: (payload: unknown) => void): unknown;
  off(event: string, listener: (payload: unknown) => void): unknown;
}

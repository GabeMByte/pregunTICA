import { randomInt, randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { LocalQuestionSource, loadFallbackBank } from './ai/local-question-source.js';
import type { QuestionSource } from './rooms/question-source.js';
import { RoomRegistry, type Scheduler } from './rooms/room-registry.js';
import { broadcastChange, notifyGenerationError, registerHandlers } from './socket/handlers.js';
import type { GameServer } from './socket/types.js';

/** Largest accepted socket message. Every client payload is a few hundred bytes at most. */
export const MAX_MESSAGE_BYTES = 10_000;

export interface AppOptions {
  /** Read the client IP from X-Forwarded-For (only behind a trusted proxy). */
  trustProxy: boolean;
  questionSource: QuestionSource;
  clock: () => number;
  scheduler: Scheduler;
}

export interface App {
  httpServer: HttpServer;
  io: GameServer;
  registry: RoomRegistry;
}

/** crypto.randomInt needs max - min < 2^48; 2^32 is plenty for picking room code characters. */
const RANDOM_RANGE = 2 ** 32;

const realScheduler: Scheduler = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

export function createApp(overrides: Partial<AppOptions> = {}): App {
  const options: AppOptions = {
    trustProxy: false,
    questionSource: overrides.questionSource ?? new LocalQuestionSource(loadFallbackBank()),
    clock: Date.now,
    scheduler: realScheduler,
    ...overrides,
  };

  const httpServer = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404).end();
  });

  const io: GameServer = new Server(httpServer, { maxHttpBufferSize: MAX_MESSAGE_BYTES });

  const registry = new RoomRegistry({
    clock: options.clock,
    random: () => randomInt(RANDOM_RANGE) / RANDOM_RANGE,
    newToken: randomUUID,
    questionSource: options.questionSource,
    scheduler: options.scheduler,
    onChange: (change) => {
      broadcastChange(io, change);
    },
    onGenerationError: (roomCode, error) => {
      console.error(`Question generation failed for room ${roomCode}`, error);
      notifyGenerationError(io, roomCode);
    },
  });

  registerHandlers(io, registry, { trustProxy: options.trustProxy, newPlayerId: randomUUID });

  return { httpServer, io, registry };
}

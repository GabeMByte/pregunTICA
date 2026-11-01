import { randomInt, randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { LocalQuestionSource, loadFallbackBanks } from './ai/local-question-source.js';
import { describeError } from './ai/safe-log.js';
import { createStaticHandler } from './http/static-files.js';
import type { QuestionSource } from './rooms/question-source.js';
import { RoomRegistry, type Scheduler } from './rooms/room-registry.js';
import { isAllowedOrigin } from './socket/origin.js';
import { broadcastChange, notifyGenerationError, notifyTopicRejected, registerHandlers } from './socket/handlers.js';
import type { GameServer } from './socket/types.js';

/** Largest accepted socket message. Every client payload is a few hundred bytes at most. */
export const MAX_MESSAGE_BYTES = 10_000;

export interface AppOptions {
  /** Read the client IP from X-Forwarded-For (only behind a trusted proxy). */
  trustProxy: boolean;
  questionSource: QuestionSource;
  clock: () => number;
  scheduler: Scheduler;
  /** The web build, served on the same port (SPEC §4 Despliegue). Undefined in development: Vite serves it. */
  staticDir: string | undefined;
  /** The only origin allowed to open a socket (SPEC §10). Undefined in development: any origin. */
  publicOrigin: string | undefined;
}

export interface App {
  httpServer: HttpServer;
  io: GameServer;
  registry: RoomRegistry;
}

/** crypto.randomInt needs max - min < 2^48; 2^32 is plenty for room codes and shuffling 4 options. */
const RANDOM_RANGE = 2 ** 32;

/** A number in [0, 1) from the crypto RNG. */
export const secureRandom = (): number => randomInt(RANDOM_RANGE) / RANDOM_RANGE;

/** setTimeout-based scheduler. A throwing callback is logged: an uncaught timer error would kill every room. */
export const realScheduler: Scheduler = {
  set: (callback, delayMs) =>
    setTimeout(() => {
      try {
        callback();
      } catch (error) {
        console.error(`Question timer failed: ${describeError(error)}`);
      }
    }, delayMs),
  clear: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

export function createApp(overrides: Partial<AppOptions> = {}): App {
  const options: AppOptions = {
    trustProxy: false,
    questionSource: overrides.questionSource ?? new LocalQuestionSource(loadFallbackBanks(), secureRandom),
    clock: Date.now,
    scheduler: realScheduler,
    staticDir: undefined,
    publicOrigin: undefined,
    ...overrides,
  };

  const serveStatic = options.staticDir === undefined ? undefined : createStaticHandler(options.staticDir);

  // Socket.io answers /socket.io/ before this handler runs.
  const httpServer = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (serveStatic === undefined) {
      res.writeHead(404).end();
      return;
    }
    void serveStatic(req, res);
  });

  const { publicOrigin } = options;
  const io: GameServer = new Server(httpServer, {
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
    ...(publicOrigin === undefined ? {} : { cors: { origin: publicOrigin } }),
    allowRequest: (req, callback) => {
      callback(null, isAllowedOrigin(req.headers.origin, publicOrigin));
    },
  });

  const registry = new RoomRegistry({
    clock: options.clock,
    random: secureRandom,
    newToken: randomUUID,
    questionSource: options.questionSource,
    scheduler: options.scheduler,
    onChange: (change) => {
      broadcastChange(io, change);
    },
    onGenerationError: (roomCode, error) => {
      console.error(`Question generation failed for room ${roomCode}: ${describeError(error)}`);
      notifyGenerationError(io, roomCode);
    },
    onTopicRejected: (roomCode) => {
      notifyTopicRejected(io, roomCode);
    },
  });

  registerHandlers(io, registry, { trustProxy: options.trustProxy, newPlayerId: randomUUID, clock: options.clock });

  return { httpServer, io, registry };
}

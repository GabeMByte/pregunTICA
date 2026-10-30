import { timingSafeEqual } from 'node:crypto';
import {
  ROOM_CREATION_LIMIT,
  ROOM_CREATION_WINDOW_MS,
  ROOM_IDLE_TTL_MS,
  type Difficulty,
  type ErrorCode,
  type Language,
} from '@preguntica/shared';
import { createGame, reduce, type EngineResult, type GameAction, type GameState } from '../engine/index.js';
import { TopicRejectedError, type QuestionSource } from './question-source.js';
import { createRateLimiter } from './rate-limiter.js';
import { generateRoomCode } from './room-code.js';

export type TimerHandle = unknown;

/** Injected so tests can fire timers manually. */
export interface Scheduler {
  set(callback: () => void, delayMs: number): TimerHandle;
  clear(handle: TimerHandle): void;
}

export interface RoomChange {
  roomCode: string;
  previous: GameState;
  next: GameState;
}

export interface RoomRegistryDeps {
  /** Current time in epoch ms. */
  clock: () => number;
  /** Uniform random number in [0, 1), used for room codes. */
  random: () => number;
  /** New host token (a UUID). */
  newToken: () => string;
  questionSource: QuestionSource;
  scheduler: Scheduler;
  /** Called after every dispatch that changes a room's state (not for no-ops or errors). */
  onChange: (change: RoomChange) => void;
  /** Called when the question source rejects; the room stays in GENERATING. */
  onGenerationError: (roomCode: string, error: unknown) => void;
  /** Called after a room is removed because the AI rejected its topic (SPEC §6). */
  onTopicRejected: (roomCode: string) => void;
}

export interface RoomConfig {
  topic: string;
  count: number;
  difficulty: Difficulty;
  language: Language;
}

export type CreateRoomResult =
  | { ok: true; roomCode: string; hostToken: string }
  | { ok: false; error: Extract<ErrorCode, 'RATE_LIMITED'> };

interface Room {
  state: GameState;
  /** Kept outside GameState so it can never reach a view or an onChange listener. */
  hostToken: string;
  lastActivityAt: number;
  /** Pending question timer. Wrapped because TimerHandle is opaque (`unknown`). */
  timer: { handle: TimerHandle } | null;
}

/** In-memory rooms: engine state, host token, question timer and idle expiry. */
export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();
  private readonly creationLimiter = createRateLimiter({ limit: ROOM_CREATION_LIMIT, windowMs: ROOM_CREATION_WINDOW_MS });

  constructor(private readonly deps: RoomRegistryDeps) {}

  /** Rate-limited per `clientKey` (the client IP). Starts question generation in the background. */
  create(config: RoomConfig, clientKey: string): CreateRoomResult {
    const now = this.deps.clock();
    if (!this.creationLimiter.tryAcquire(clientKey, now)) return { ok: false, error: 'RATE_LIMITED' };

    const roomCode = generateRoomCode(this.deps.random, (code) => this.rooms.has(code));
    const hostToken = this.deps.newToken();
    const { topic, count, difficulty } = config;
    const room: Room = { state: createGame({ code: roomCode, topic, count, difficulty }), hostToken, lastActivityAt: now, timer: null };
    this.rooms.set(roomCode, room);
    this.generateQuestions(roomCode, room, config);
    return { ok: true, roomCode, hostToken };
  }

  get(roomCode: string): GameState | undefined {
    return this.rooms.get(roomCode)?.state;
  }

  /** Applies an engine action with now = clock(). Unknown room → ROOM_NOT_FOUND. */
  dispatch(roomCode: string, action: GameAction): EngineResult {
    const room = this.rooms.get(roomCode);
    if (room === undefined) return { ok: false, error: 'ROOM_NOT_FOUND' };

    const now = this.deps.clock();
    const previous = room.state;
    const result = reduce(previous, action, now);
    // Errors and no-ops (the engine returns the same state) change nothing.
    if (!result.ok || result.state === previous) return result;

    room.state = result.state;
    room.lastActivityAt = now;
    this.syncTimer(roomCode, room, previous);
    this.deps.onChange({ roomCode, previous, next: result.state });
    return result;
  }

  /** Constant-time comparison against the room's host token. False for unknown rooms. */
  verifyHost(roomCode: string, hostToken: string): boolean {
    const room = this.rooms.get(roomCode);
    if (room === undefined) return false;
    const expected = Buffer.from(room.hostToken);
    const actual = Buffer.from(hostToken);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  /** Deletes a room and cancels its timer. False for unknown rooms. */
  remove(roomCode: string): boolean {
    const room = this.rooms.get(roomCode);
    if (room === undefined) return false;
    this.clearTimer(room);
    return this.rooms.delete(roomCode);
  }

  /** Removes rooms idle for more than ROOM_IDLE_TTL_MS, cancelling their timers. Returns removed codes. */
  sweep(): string[] {
    const now = this.deps.clock();
    const removed: string[] = [];
    for (const [roomCode, room] of this.rooms) {
      if (now - room.lastActivityAt <= ROOM_IDLE_TTL_MS) continue;
      this.clearTimer(room);
      this.rooms.delete(roomCode);
      removed.push(roomCode);
    }
    this.creationLimiter.prune(now);
    return removed;
  }

  private generateQuestions(roomCode: string, room: Room, config: RoomConfig): void {
    // async wrapper: a synchronous throw from the source becomes a rejection too.
    const load = async () => this.deps.questionSource.getQuestions(config);
    void load()
      .then(({ questions, origin }) => {
        // Swept while generating, or the code now belongs to a new room: identity, not just the code.
        if (this.rooms.get(roomCode) !== room) return;
        const result = this.dispatch(roomCode, { type: 'questionsReady', questions, origin });
        if (!result.ok) throw new Error(`questionsReady failed: ${result.error}`);
      })
      // Also catches a throw while applying the questions, which would otherwise be an unhandled rejection.
      .catch((error: unknown) => {
        if (error instanceof TopicRejectedError) {
          if (this.rooms.get(roomCode) !== room) return;
          this.remove(roomCode);
          this.deps.onTopicRejected(roomCode);
          return;
        }
        this.deps.onGenerationError(roomCode, error);
      });
  }

  /** One timer per room, alive only while the room is in QUESTION. */
  private syncTimer(roomCode: string, room: Room, previous: GameState): void {
    const { state } = room;
    if (state.phase !== 'QUESTION') {
      this.clearTimer(room);
      return;
    }
    const isNewQuestion = previous.phase !== 'QUESTION' || previous.questionIndex !== state.questionIndex;
    if (!isNewQuestion || state.questionEndsAt === null) return;

    this.clearTimer(room);
    const delayMs = Math.max(0, state.questionEndsAt - this.deps.clock());
    const handle = this.deps.scheduler.set(() => {
      room.timer = null;
      this.dispatch(roomCode, { type: 'timeUp' });
    }, delayMs);
    room.timer = { handle };
  }

  private clearTimer(room: Room): void {
    if (room.timer === null) return;
    this.deps.scheduler.clear(room.timer.handle);
    room.timer = null;
  }
}

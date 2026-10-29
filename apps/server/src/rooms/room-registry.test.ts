import { describe, expect, it, vi } from 'vitest';
import {
  QUESTION_TIME_MS,
  ROOM_CODE_ALPHABET,
  ROOM_CREATION_LIMIT,
  ROOM_CREATION_WINDOW_MS,
  ROOM_IDLE_TTL_MS,
  RoomCodeSchema,
  type Question,
} from '@preguntica/shared';
import type { GameState } from '../engine/index.js';
import { err, makeQuestions, nickname, ok, playerId } from '../engine/test-helpers.js';
import type { QuestionRequest } from './question-source.js';
import { RoomRegistry, type CreateRoomResult, type RoomChange, type RoomConfig, type TimerHandle } from './room-registry.js';

const T0 = 1_700_000_000_000;
const IP = '203.0.113.7';
const OTHER_IP = '198.51.100.9';
const CONFIG: RoomConfig = { topic: 'Costa Rica', count: 5, difficulty: 'medium' };
/** All questions correct at index 0. */
const QUESTIONS = makeQuestions(5, [0, 0, 0, 0, 0]);
const UNKNOWN_ROOM = 'ZZZZZZ';

function token(n: number): string {
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
}

/** Deterministic pseudo-random source (Park–Miller LCG) in [0, 1). */
function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    resolve: (value) => {
      resolve(value);
    },
    reject: (error) => {
      reject(error);
    },
  };
}

interface FakeTimer {
  callback: () => void;
  delayMs: number;
  cleared: boolean;
  fired: boolean;
}

/** Manual scheduler: records timers; the test decides when (and whether) they fire. */
function createScheduler() {
  const timers: FakeTimer[] = [];
  const set = vi.fn((callback: () => void, delayMs: number): TimerHandle => {
    const timer: FakeTimer = { callback, delayMs, cleared: false, fired: false };
    timers.push(timer);
    return timer;
  });
  const clear = vi.fn((handle: TimerHandle): void => {
    for (const timer of timers) if (timer === handle) timer.cleared = true;
  });
  return {
    timers,
    set,
    clear,
    /** Timers neither cleared nor fired. */
    active: () => timers.filter((t) => !t.cleared && !t.fired),
    fire: (timer: FakeTimer) => {
      timer.fired = true;
      timer.callback();
    },
  };
}

type GetQuestions = (request: QuestionRequest) => Promise<Question[]>;

function setup(options: { getQuestions?: GetQuestions; random?: () => number } = {}) {
  const clock = { now: T0 };
  let tokens = 0;
  const scheduler = createScheduler();
  const getQuestions = vi.fn<GetQuestions>(options.getQuestions ?? (() => Promise.resolve(QUESTIONS)));
  const onChange = vi.fn<(change: RoomChange) => void>();
  const onGenerationError = vi.fn<(roomCode: string, error: unknown) => void>();
  const registry = new RoomRegistry({
    clock: () => clock.now,
    random: options.random ?? lcg(42),
    newToken: () => token(++tokens),
    questionSource: { getQuestions },
    scheduler: { set: scheduler.set, clear: scheduler.clear },
    onChange,
    onGenerationError,
  });
  return { registry, clock, scheduler, getQuestions, onChange, onGenerationError };
}

type Harness = ReturnType<typeof setup>;

function created(result: CreateRoomResult): { roomCode: string; hostToken: string } {
  if (!result.ok) throw new Error(`Expected a room, got ${result.error}`);
  return result;
}

function current(h: Harness, roomCode: string): GameState {
  const state = h.registry.get(roomCode);
  if (state === undefined) throw new Error(`Room ${roomCode} not found`);
  return state;
}

function endsAt(state: GameState): number {
  if (state.questionEndsAt === null) throw new Error('questionEndsAt not set');
  return state.questionEndsAt;
}

/** Creates a room, waits for LOBBY and joins players 1..n. */
async function lobbyRoom(h: Harness, players = 1, clientKey = IP) {
  const room = created(h.registry.create(CONFIG, clientKey));
  await vi.waitFor(() => {
    expect(h.registry.get(room.roomCode)?.phase).toBe('LOBBY');
  });
  for (let i = 1; i <= players; i++) {
    ok(h.registry.dispatch(room.roomCode, { type: 'join', playerId: playerId(i), nickname: nickname(i) }));
  }
  return room;
}

/** Room in QUESTION 0 with players 1..n. */
async function startedRoom(h: Harness, players = 1) {
  const room = await lobbyRoom(h, players);
  ok(h.registry.dispatch(room.roomCode, { type: 'start' }));
  return room;
}

function answer(h: Harness, roomCode: string, player: number, optionIndex = 0) {
  const questionIndex = current(h, roomCode).questionIndex ?? -1;
  return h.registry.dispatch(roomCode, { type: 'answer', playerId: playerId(player), questionIndex, optionIndex });
}

describe('SPEC §3 GENERATING: create', () => {
  it('returns a valid room code and the host token', () => {
    const h = setup();
    const result = h.registry.create(CONFIG, IP);
    expect(result).toEqual({ ok: true, roomCode: expect.any(String) as unknown, hostToken: token(1) });
    const { roomCode } = created(result);
    expect(RoomCodeSchema.safeParse(roomCode)).toEqual({ success: true, data: roomCode });
  });

  it('stores the room in GENERATING with the requested topic and difficulty', () => {
    const h = setup({ getQuestions: () => deferred<Question[]>().promise });
    const { roomCode } = created(h.registry.create({ topic: 'Volcanes', count: 7, difficulty: 'hard' }, IP));
    expect(current(h, roomCode)).toMatchObject({
      code: roomCode,
      phase: 'GENERATING',
      topic: 'Volcanes',
      difficulty: 'hard',
      totalQuestions: 7,
      players: [],
    });
  });

  it('get returns undefined for an unknown room', () => {
    expect(setup().registry.get(UNKNOWN_ROOM)).toBeUndefined();
  });

  it('never reuses the code of an existing room', () => {
    // First 12 random values map to the same code; afterwards a different one.
    let calls = 0;
    const random = () => (calls++ < 12 ? 0 : 1.5 / ROOM_CODE_ALPHABET.length);
    const h = setup({ random });
    const a = created(h.registry.create(CONFIG, IP)).roomCode;
    const b = created(h.registry.create(CONFIG, IP)).roomCode;
    expect(b).not.toBe(a);
    expect(current(h, a).code).toBe(a);
    expect(current(h, b).code).toBe(b);
  });

  it('gives every room its own host token', () => {
    const h = setup();
    const a = created(h.registry.create(CONFIG, IP));
    const b = created(h.registry.create(CONFIG, IP));
    expect([a.hostToken, b.hostToken]).toEqual([token(1), token(2)]);
  });
});

describe('SPEC §3 GENERATING → LOBBY: questions generated in the background', () => {
  it('asks the question source for topic, count and difficulty', () => {
    const h = setup();
    h.registry.create({ topic: 'Volcanes', count: 7, difficulty: 'easy' }, IP);
    expect(h.getQuestions).toHaveBeenCalledTimes(1);
    expect(h.getQuestions).toHaveBeenCalledWith({ topic: 'Volcanes', count: 7, difficulty: 'easy' });
  });

  it('moves the room to LOBBY when the questions resolve and notifies onChange', async () => {
    const h = setup();
    const { roomCode } = created(h.registry.create(CONFIG, IP));
    await vi.waitFor(() => {
      expect(h.registry.get(roomCode)?.phase).toBe('LOBBY');
    });
    expect(current(h, roomCode).questions).toEqual(QUESTIONS);
    const toLobby = h.onChange.mock.calls.filter(([change]) => change.next.phase === 'LOBBY');
    expect(toLobby).toHaveLength(1);
    expect(toLobby[0]?.[0]).toMatchObject({ roomCode, previous: { phase: 'GENERATING' }, next: { phase: 'LOBBY' } });
  });

  it('players can join while GENERATING and are kept when the questions arrive', async () => {
    const pending = deferred<Question[]>();
    const h = setup({ getQuestions: () => pending.promise });
    const { roomCode } = created(h.registry.create(CONFIG, IP));
    ok(h.registry.dispatch(roomCode, { type: 'join', playerId: playerId(1), nickname: nickname(1) }));
    expect(current(h, roomCode).phase).toBe('GENERATING');

    pending.resolve(QUESTIONS);
    await pending.promise;
    await vi.waitFor(() => {
      expect(h.registry.get(roomCode)?.phase).toBe('LOBBY');
    });
    expect(current(h, roomCode).players.map((p) => p.id)).toEqual([playerId(1)]);
  });

  it('on rejection calls onGenerationError(roomCode, error) and the room stays in GENERATING', async () => {
    const failure = new Error('AI down');
    const h = setup({ getQuestions: () => Promise.reject(failure) });
    const { roomCode } = created(h.registry.create(CONFIG, IP));
    await vi.waitFor(() => {
      expect(h.onGenerationError).toHaveBeenCalledWith(roomCode, failure);
    });
    expect(h.onGenerationError).toHaveBeenCalledTimes(1);
    expect(current(h, roomCode).phase).toBe('GENERATING');
    expect(h.onChange.mock.calls.some(([change]) => change.next.phase === 'LOBBY')).toBe(false);
  });

  it('security review M2: an exception while applying the questions goes to onGenerationError, not to an unhandled rejection', async () => {
    const h = setup();
    const failure = new Error('listener failed');
    h.onChange.mockImplementationOnce(() => {
      throw failure;
    });
    const { roomCode } = created(h.registry.create(CONFIG, IP));
    await vi.waitFor(() => {
      expect(h.onGenerationError).toHaveBeenCalledWith(roomCode, failure);
    });
  });

  it('a manually rejected deferred also leaves the room in GENERATING', async () => {
    const pending = deferred<Question[]>();
    const h = setup({ getQuestions: () => pending.promise });
    const { roomCode } = created(h.registry.create(CONFIG, IP));
    const failure = new Error('timeout');
    pending.reject(failure);
    await expect(pending.promise).rejects.toBe(failure);
    await vi.waitFor(() => {
      expect(h.onGenerationError).toHaveBeenCalledWith(roomCode, failure);
    });
    expect(current(h, roomCode).phase).toBe('GENERATING');
  });
});

describe('SPEC §3 Límites: max 5 rooms per IP every 10 min', () => {
  it(`allows ${ROOM_CREATION_LIMIT} creations and rejects the next with RATE_LIMITED`, () => {
    const h = setup();
    for (let i = 0; i < ROOM_CREATION_LIMIT; i++) expect(h.registry.create(CONFIG, IP).ok).toBe(true);
    expect(h.registry.create(CONFIG, IP)).toEqual({ ok: false, error: 'RATE_LIMITED' });
    expect(h.getQuestions).toHaveBeenCalledTimes(ROOM_CREATION_LIMIT);
  });

  it('another client key is not affected', () => {
    const h = setup();
    for (let i = 0; i < ROOM_CREATION_LIMIT; i++) h.registry.create(CONFIG, IP);
    expect(h.registry.create(CONFIG, OTHER_IP).ok).toBe(true);
  });

  it('works again once the window has passed (not 1 ms before)', () => {
    const h = setup();
    for (let i = 0; i < ROOM_CREATION_LIMIT; i++) h.registry.create(CONFIG, IP);
    h.clock.now = T0 + ROOM_CREATION_WINDOW_MS - 1;
    expect(h.registry.create(CONFIG, IP)).toEqual({ ok: false, error: 'RATE_LIMITED' });
    h.clock.now = T0 + ROOM_CREATION_WINDOW_MS;
    expect(h.registry.create(CONFIG, IP).ok).toBe(true);
  });
});

describe('SPEC §4 Motor puro: dispatch applies engine actions', () => {
  it('returns ROOM_NOT_FOUND for an unknown room', () => {
    const h = setup();
    expect(h.registry.dispatch(UNKNOWN_ROOM, { type: 'start' })).toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
    expect(h.onChange).not.toHaveBeenCalled();
  });

  it('returns engine errors as-is without calling onChange or changing the room', () => {
    const h = setup({ getQuestions: () => deferred<Question[]>().promise });
    const { roomCode } = created(h.registry.create(CONFIG, IP));
    const before = current(h, roomCode);
    h.onChange.mockClear();
    expect(err(h.registry.dispatch(roomCode, { type: 'start' }))).toBe('QUESTIONS_NOT_READY');
    expect(h.onChange).not.toHaveBeenCalled();
    expect(current(h, roomCode)).toEqual(before);
  });

  it('returns NO_PLAYERS from the engine when starting an empty lobby', async () => {
    const h = setup();
    const { roomCode } = await lobbyRoom(h, 0);
    h.onChange.mockClear();
    expect(err(h.registry.dispatch(roomCode, { type: 'start' }))).toBe('NO_PLAYERS');
    expect(h.onChange).not.toHaveBeenCalled();
  });

  it('stores the new state and calls onChange exactly once with previous and next', async () => {
    const h = setup();
    const { roomCode } = await lobbyRoom(h, 0);
    const previous = current(h, roomCode);
    h.onChange.mockClear();
    const next = ok(h.registry.dispatch(roomCode, { type: 'join', playerId: playerId(1), nickname: 'Ana' }));
    expect(next.players.map((p) => p.nickname)).toEqual(['Ana']);
    expect(current(h, roomCode)).toEqual(next);
    expect(h.onChange).toHaveBeenCalledTimes(1);
    expect(h.onChange).toHaveBeenCalledWith({ roomCode, previous, next });
  });

  it('does not call onChange for a no-op: timeUp before questionEndsAt', async () => {
    const h = setup();
    const { roomCode } = await startedRoom(h, 2);
    const before = current(h, roomCode);
    h.onChange.mockClear();
    h.clock.now = endsAt(before) - 1;
    expect(ok(h.registry.dispatch(roomCode, { type: 'timeUp' }))).toEqual(before);
    expect(h.onChange).not.toHaveBeenCalled();
    expect(current(h, roomCode).phase).toBe('QUESTION');
  });

  it('does not call onChange for a no-op: a second answer of the same player', async () => {
    const h = setup();
    const { roomCode } = await startedRoom(h, 2);
    ok(answer(h, roomCode, 1));
    h.onChange.mockClear();
    ok(answer(h, roomCode, 1, 2));
    expect(h.onChange).not.toHaveBeenCalled();
  });

  it('uses now = clock(): start sets questionEndsAt = clock() + QUESTION_TIME_MS', async () => {
    const h = setup();
    const { roomCode } = await lobbyRoom(h, 1);
    h.clock.now = T0 + 5000;
    const state = ok(h.registry.dispatch(roomCode, { type: 'start' }));
    expect(state.questionStartedAt).toBe(T0 + 5000);
    expect(state.questionEndsAt).toBe(T0 + 5000 + QUESTION_TIME_MS);
  });

  it('uses now = clock() for answers: elapsedMs is measured with the injected clock', async () => {
    const h = setup();
    const { roomCode } = await startedRoom(h, 2);
    h.clock.now = T0 + 1234;
    const state = ok(answer(h, roomCode, 1, 2));
    expect(state.answers[playerId(1)]).toEqual({ optionIndex: 2, elapsedMs: 1234 });
  });
});

describe('SPEC §3 QUESTION: 20 s timer', () => {
  it('entering QUESTION schedules exactly one timer with delay questionEndsAt - clock()', async () => {
    const h = setup();
    const { roomCode } = await lobbyRoom(h, 1);
    expect(h.scheduler.active()).toHaveLength(0);
    h.clock.now = T0 + 777;
    const state = ok(h.registry.dispatch(roomCode, { type: 'start' }));
    expect(h.scheduler.set).toHaveBeenCalledTimes(1);
    expect(h.scheduler.active()).toHaveLength(1);
    expect(h.scheduler.active()[0]?.delayMs).toBe(endsAt(state) - h.clock.now);
    expect(h.scheduler.active()[0]?.delayMs).toBe(QUESTION_TIME_MS);
  });

  it('firing the timer dispatches timeUp: the room reaches REVEAL and onChange is called', async () => {
    const h = setup();
    const { roomCode } = await startedRoom(h, 2);
    const [timer] = h.scheduler.active();
    if (timer === undefined) throw new Error('no timer scheduled');
    h.clock.now = endsAt(current(h, roomCode));
    h.onChange.mockClear();
    h.scheduler.fire(timer);
    expect(current(h, roomCode).phase).toBe('REVEAL');
    expect(h.onChange).toHaveBeenCalledTimes(1);
    expect(h.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ roomCode, previous: expect.objectContaining({ phase: 'QUESTION' }) as unknown, next: expect.objectContaining({ phase: 'REVEAL' }) as unknown }),
    );
  });

  it('clears the timer when everyone answers before time is up', async () => {
    const h = setup();
    const { roomCode } = await startedRoom(h, 1);
    const handle: unknown = h.scheduler.set.mock.results[0]?.value;
    h.clock.now = T0 + 100;
    expect(ok(answer(h, roomCode, 1)).phase).toBe('REVEAL');
    expect(h.scheduler.clear).toHaveBeenCalledWith(handle);
    expect(h.scheduler.active()).toHaveLength(0);
  });

  it('clears the timer when REVEAL is reached by the last pending player disconnecting', async () => {
    const h = setup();
    const { roomCode } = await startedRoom(h, 2);
    const handle: unknown = h.scheduler.set.mock.results[0]?.value;
    ok(answer(h, roomCode, 1));
    expect(h.scheduler.clear).not.toHaveBeenCalledWith(handle);
    expect(ok(h.registry.dispatch(roomCode, { type: 'disconnect', playerId: playerId(2) })).phase).toBe('REVEAL');
    expect(h.scheduler.clear).toHaveBeenCalledWith(handle);
  });

  it('clears the timer when timeUp is dispatched directly at questionEndsAt', async () => {
    const h = setup();
    const { roomCode } = await startedRoom(h, 2);
    const handle: unknown = h.scheduler.set.mock.results[0]?.value;
    h.clock.now = endsAt(current(h, roomCode));
    expect(ok(h.registry.dispatch(roomCode, { type: 'timeUp' })).phase).toBe('REVEAL');
    expect(h.scheduler.clear).toHaveBeenCalledWith(handle);
  });

  it('a stale timer fired after leaving QUESTION is a harmless no-op', async () => {
    const h = setup();
    const { roomCode } = await startedRoom(h, 1);
    const timer = h.scheduler.timers[0];
    if (timer === undefined) throw new Error('no timer scheduled');
    ok(answer(h, roomCode, 1));
    const reveal = current(h, roomCode);
    h.onChange.mockClear();
    h.clock.now = endsAt(reveal);
    h.scheduler.fire(timer);
    expect(current(h, roomCode)).toEqual(reveal);
    expect(h.onChange).not.toHaveBeenCalled();
  });

  it('each new QUESTION (after next, next) schedules a new timer', async () => {
    const h = setup();
    const { roomCode } = await startedRoom(h, 1);
    ok(answer(h, roomCode, 1));
    h.clock.now = T0 + 30_000;
    expect(ok(h.registry.dispatch(roomCode, { type: 'next' })).phase).toBe('LEADERBOARD');
    expect(h.scheduler.set).toHaveBeenCalledTimes(1);
    const state = ok(h.registry.dispatch(roomCode, { type: 'next' }));
    expect(state).toMatchObject({ phase: 'QUESTION', questionIndex: 1 });
    expect(h.scheduler.set).toHaveBeenCalledTimes(2);
    expect(h.scheduler.active()).toHaveLength(1);
    expect(h.scheduler.active()[0]).toBe(h.scheduler.timers[1]);
    expect(h.scheduler.timers[1]?.delayMs).toBe(endsAt(state) - h.clock.now);
  });

  it('the timer of the second question also reaches REVEAL', async () => {
    const h = setup();
    const { roomCode } = await startedRoom(h, 2);
    h.clock.now = endsAt(current(h, roomCode));
    ok(h.registry.dispatch(roomCode, { type: 'timeUp' }));
    ok(h.registry.dispatch(roomCode, { type: 'next' }));
    ok(h.registry.dispatch(roomCode, { type: 'next' }));
    const timer = h.scheduler.timers[1];
    if (timer === undefined) throw new Error('no second timer');
    h.clock.now = endsAt(current(h, roomCode));
    h.scheduler.fire(timer);
    expect(current(h, roomCode)).toMatchObject({ phase: 'REVEAL', questionIndex: 1 });
  });
});

describe('SPEC §5 host:rejoin: verifyHost', () => {
  it('is true for the right token', async () => {
    const h = setup();
    const { roomCode, hostToken } = await lobbyRoom(h, 0);
    expect(h.registry.verifyHost(roomCode, hostToken)).toBe(true);
  });

  it('is false for a wrong token, an empty token and the token of another room', () => {
    const h = setup();
    const a = created(h.registry.create(CONFIG, IP));
    const b = created(h.registry.create(CONFIG, IP));
    expect(h.registry.verifyHost(a.roomCode, token(999))).toBe(false);
    expect(h.registry.verifyHost(a.roomCode, '')).toBe(false);
    expect(h.registry.verifyHost(a.roomCode, b.hostToken)).toBe(false);
    expect(h.registry.verifyHost(b.roomCode, a.hostToken)).toBe(false);
  });

  it('is false for an unknown room', () => {
    const h = setup();
    const { hostToken } = created(h.registry.create(CONFIG, IP));
    expect(h.registry.verifyHost(UNKNOWN_ROOM, hostToken)).toBe(false);
  });
});

describe('SPEC §3 Límites: rooms idle for more than 1 h are removed', () => {
  it('keeps a room idle for exactly ROOM_IDLE_TTL_MS', async () => {
    const h = setup();
    const { roomCode } = await lobbyRoom(h, 0);
    h.clock.now = T0 + ROOM_IDLE_TTL_MS;
    expect(h.registry.sweep()).toEqual([]);
    expect(h.registry.get(roomCode)).toBeDefined();
  });

  it('removes a room idle for ROOM_IDLE_TTL_MS + 1 and returns its code', async () => {
    const h = setup();
    const { roomCode, hostToken } = await lobbyRoom(h, 0);
    h.clock.now = T0 + ROOM_IDLE_TTL_MS + 1;
    expect(h.registry.sweep()).toEqual([roomCode]);
    expect(h.registry.get(roomCode)).toBeUndefined();
    expect(h.registry.dispatch(roomCode, { type: 'start' })).toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
    expect(h.registry.verifyHost(roomCode, hostToken)).toBe(false);
  });

  it('clears the pending question timer of a removed room', async () => {
    const h = setup();
    const { roomCode } = await startedRoom(h, 1);
    const handle: unknown = h.scheduler.set.mock.results[0]?.value;
    h.clock.now = T0 + ROOM_IDLE_TTL_MS + 1;
    expect(h.registry.sweep()).toEqual([roomCode]);
    expect(h.scheduler.clear).toHaveBeenCalledWith(handle);
    expect(h.scheduler.active()).toHaveLength(0);
  });

  it('keeps rooms with recent activity and removes only the idle ones', async () => {
    const h = setup();
    const idle = await lobbyRoom(h, 0);
    const active = await lobbyRoom(h, 0);
    h.clock.now = T0 + 30 * 60 * 1000;
    ok(h.registry.dispatch(active.roomCode, { type: 'join', playerId: playerId(1), nickname: nickname(1) }));
    h.clock.now = T0 + ROOM_IDLE_TTL_MS + 1;
    expect(h.registry.sweep()).toEqual([idle.roomCode]);
    expect(h.registry.get(active.roomCode)).toBeDefined();
  });

  it('a successful dispatch refreshes the activity time (idle measured from it)', async () => {
    const h = setup();
    const { roomCode } = await lobbyRoom(h, 0);
    const lastActivity = T0 + 10_000;
    h.clock.now = lastActivity;
    ok(h.registry.dispatch(roomCode, { type: 'join', playerId: playerId(1), nickname: nickname(1) }));
    h.clock.now = lastActivity + ROOM_IDLE_TTL_MS;
    expect(h.registry.sweep()).toEqual([]);
    h.clock.now = lastActivity + ROOM_IDLE_TTL_MS + 1;
    expect(h.registry.sweep()).toEqual([roomCode]);
  });

  it('a failed dispatch does not refresh the activity time', async () => {
    const h = setup();
    const { roomCode } = await lobbyRoom(h, 0);
    h.clock.now = T0 + 30 * 60 * 1000;
    expect(err(h.registry.dispatch(roomCode, { type: 'start' }))).toBe('NO_PLAYERS');
    h.clock.now = T0 + ROOM_IDLE_TTL_MS + 1;
    expect(h.registry.sweep()).toEqual([roomCode]);
  });
});

describe('security review B3: a room code reused after a sweep', () => {
  it('late questions of the swept room never reach the new room with the same code', async () => {
    const first = deferred<Question[]>();
    const second = deferred<Question[]>();
    const pending = [first, second];
    // random = 0 always yields the same code once it is free again.
    const h = setup({ random: () => 0, getQuestions: () => pending.shift()?.promise ?? Promise.resolve(QUESTIONS) });
    const old = created(h.registry.create(CONFIG, IP));
    h.clock.now = T0 + ROOM_IDLE_TTL_MS + 1;
    expect(h.registry.sweep()).toEqual([old.roomCode]);
    const reused = created(h.registry.create({ ...CONFIG, topic: 'Otro' }, OTHER_IP));
    expect(reused.roomCode).toBe(old.roomCode);

    first.resolve(QUESTIONS);
    await first.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(current(h, reused.roomCode).phase).toBe('GENERATING');
    expect(h.onGenerationError).not.toHaveBeenCalled();
  });
});

describe('SPEC §5 hostToken never reaches other clients', () => {
  it('does not appear in any GameState passed to onChange nor in get()', async () => {
    const h = setup();
    const { roomCode, hostToken } = await startedRoom(h, 2);
    ok(answer(h, roomCode, 1));
    ok(answer(h, roomCode, 2, 1));
    ok(h.registry.dispatch(roomCode, { type: 'next' }));
    expect(h.onChange.mock.calls.length).toBeGreaterThan(0);
    for (const [change] of h.onChange.mock.calls) {
      expect(JSON.stringify(change.previous)).not.toContain(hostToken);
      expect(JSON.stringify(change.next)).not.toContain(hostToken);
    }
    expect(JSON.stringify(current(h, roomCode))).not.toContain(hostToken);
  });
});

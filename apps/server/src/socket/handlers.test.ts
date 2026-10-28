import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ErrorPayloadSchema,
  GameEndPayloadSchema,
  HostCreatedPayloadSchema,
  LeaderboardPayloadSchema,
  PlayerJoinedPayloadSchema,
  QUESTION_TIME_MS,
  QuestionRevealPayloadSchema,
  QuestionStartPayloadSchema,
  RoomStatePayloadSchema,
  serverPayloadSchemas,
  type ClientToServerEvents,
  type ServerEvent,
  type ServerToClientEvents,
} from '@preguntica/shared';
import { LocalQuestionSource } from '../ai/local-question-source.js';
import { makeQuestions } from '../engine/test-helpers.js';
import { RoomRegistry, type TimerHandle } from '../rooms/room-registry.js';
import { broadcastChange, registerHandlers } from './handlers.js';
import type { GameServer } from './types.js';

const T0 = 1_700_000_000_000;
/** Every question's correct answer is index 0. */
const RIGHT = 0;
const WRONG = 1;

interface ManualTimer {
  callback: () => void;
  cleared: boolean;
}

interface Received {
  event: string;
  payload: unknown;
}

class TestClient {
  readonly events: Received[] = [];

  constructor(readonly socket: ClientSocket<ServerToClientEvents, ClientToServerEvents>) {
    socket.onAny((event: string, payload: unknown) => {
      this.events.push({ event, payload });
    });
  }

  /** Index to pass as `since` to only look at later events. */
  mark(): number {
    return this.events.length;
  }

  received(event: ServerEvent, since = 0): unknown[] {
    return this.events.slice(since).filter((e) => e.event === event).map((e) => e.payload);
  }

  /** Waits for the first `event` at or after `since` that matches `predicate`. */
  async next(event: ServerEvent, since = 0, predicate: (payload: unknown) => boolean = () => true): Promise<unknown> {
    return vi.waitFor(
      () => {
        const found = this.received(event, since).find(predicate);
        if (found === undefined) throw new Error(`No ${event} received`);
        return found;
      },
      { timeout: 2000, interval: 10 },
    );
  }
}

const harnesses: { close: () => Promise<void> }[] = [];
const allClients: TestClient[] = [];

async function startServer(options: { trustProxy?: boolean } = {}) {
  const httpServer = createServer();
  const io: GameServer = new Server(httpServer);
  const clock = { now: T0 };
  const timers: ManualTimer[] = [];
  const registry = new RoomRegistry({
    clock: () => clock.now,
    random: Math.random,
    newToken: randomUUID,
    questionSource: new LocalQuestionSource(makeQuestions(5, [0, 0, 0, 0, 0])),
    scheduler: {
      set: (callback): TimerHandle => {
        const timer: ManualTimer = { callback, cleared: false };
        timers.push(timer);
        return timer;
      },
      clear: (handle) => {
        for (const timer of timers) if (timer === handle) timer.cleared = true;
      },
    },
    onChange: (change) => {
      broadcastChange(io, change);
    },
    onGenerationError: () => undefined,
  });
  registerHandlers(io, registry, { trustProxy: options.trustProxy ?? false, newPlayerId: randomUUID });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const url = `http://localhost:${String((httpServer.address() as AddressInfo).port)}`;

  const harness = {
    url,
    registry,
    clock,
    /** Fires the pending (not cleared) question timer. */
    fireTimer: () => {
      const timer = timers.filter((t) => !t.cleared).at(-1);
      if (timer === undefined) throw new Error('No pending timer');
      timer.cleared = true;
      timer.callback();
    },
    close: async () => {
      await io.close();
    },
  };
  harnesses.push(harness);
  return harness;
}

type Harness = Awaited<ReturnType<typeof startServer>>;

async function client(h: Harness, headers: Record<string, string> = {}): Promise<TestClient> {
  const socket: ClientSocket<ServerToClientEvents, ClientToServerEvents> = connect(h.url, {
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: headers,
  });
  const testClient = new TestClient(socket);
  allClients.push(testClient);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return testClient;
}

async function createRoom(h: Harness) {
  const host = await client(h);
  host.socket.emit('host:create', { topic: 'Cultura general', count: 5, difficulty: 'medium' });
  const { roomCode, hostToken } = HostCreatedPayloadSchema.parse(await host.next('host:created'));
  await host.next('room:state', 0, (p) => RoomStatePayloadSchema.parse(p).phase === 'LOBBY');
  return { host, roomCode, hostToken };
}

async function join(h: Harness, roomCode: string, nickname: string, playerId: string = randomUUID()) {
  const player = await client(h);
  player.socket.emit('player:join', { roomCode, nickname, playerId });
  const joined = PlayerJoinedPayloadSchema.parse(await player.next('player:joined'));
  return { player, playerId, joined };
}

async function errorCode(c: TestClient, since: number): Promise<string> {
  return ErrorPayloadSchema.parse(await c.next('error', since)).code;
}

function phaseOf(h: Harness, roomCode: string) {
  return h.registry.get(roomCode)?.phase;
}

/** Lets in-flight events arrive before asserting that something did NOT happen. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

afterEach(async () => {
  // CLAUDE.md rule #2 and SPEC §5: every payload any client received passes its strict schema.
  for (const c of allClients) {
    for (const { event, payload } of c.events) {
      if (event in serverPayloadSchemas) serverPayloadSchemas[event as ServerEvent].parse(payload);
    }
    c.socket.disconnect();
  }
  allClients.length = 0;
  await Promise.all(harnesses.splice(0).map((h) => h.close()));
});

describe('full game: 1 host + 2 players', () => {
  it('plays 5 questions from LOBBY to PODIUM with per-player results', async () => {
    const h = await startServer();
    const { host, roomCode } = await createRoom(h);
    const ana = await join(h, roomCode, 'Ana');
    const beto = await join(h, roomCode, 'Beto');
    expect(ana.joined).toEqual({ playerId: ana.playerId, nickname: 'Ana', waitingForNextQuestion: false });

    host.socket.emit('host:start', { roomCode });
    for (let q = 0; q < 5; q++) {
      const since = [host.mark(), ana.player.mark(), beto.player.mark()] as const;
      const isQ = (p: unknown) => QuestionStartPayloadSchema.parse(p).index === q;
      for (const [c, s] of [[host, since[0]], [ana.player, since[1]], [beto.player, since[2]]] as const) {
        await c.next('question:start', q === 0 ? 0 : s, isQ);
      }
      const answeredAt = ana.player.mark();
      ana.player.socket.emit('player:answer', { roomCode, questionIndex: q, optionIndex: RIGHT });
      beto.player.socket.emit('player:answer', { roomCode, questionIndex: q, optionIndex: WRONG });

      const anaReveal = QuestionRevealPayloadSchema.parse(await ana.player.next('question:reveal', answeredAt));
      expect(anaReveal.correctIndex).toBe(RIGHT);
      expect(anaReveal.yourResult).toMatchObject({ correct: true, streak: q + 1 });
      const betoReveal = QuestionRevealPayloadSchema.parse(await beto.player.next('question:reveal', since[2]));
      expect(betoReveal.yourResult).toMatchObject({ correct: false, points: 0 });
      expect(QuestionRevealPayloadSchema.parse(await host.next('question:reveal', since[0])).yourResult).toBeUndefined();

      const beforeLeaderboard = ana.player.mark();
      host.socket.emit('host:next', { roomCode });
      const top = LeaderboardPayloadSchema.parse(await ana.player.next('leaderboard', beforeLeaderboard)).top;
      expect(top.map((e) => e.nickname)).toEqual(['Ana', 'Beto']);
      host.socket.emit('host:next', { roomCode });
    }

    const podium = GameEndPayloadSchema.parse(await beto.player.next('game:end')).podium;
    expect(podium.map((p) => p.nickname)).toEqual(['Ana', 'Beto']);
    expect(podium[0]?.score).toBe(1000 + 1100 + 1200 + 1300 + 1400);
    expect(phaseOf(h, roomCode)).toBe('PODIUM');
  });

  it('never sends correctIndex in question:start and never sends the host token or player ids to players', async () => {
    const h = await startServer();
    const { host, roomCode, hostToken } = await createRoom(h);
    const ana = await join(h, roomCode, 'Ana');
    const beto = await join(h, roomCode, 'Beto');
    host.socket.emit('host:start', { roomCode });
    await ana.player.next('question:start');
    ana.player.socket.emit('player:answer', { roomCode, questionIndex: 0, optionIndex: RIGHT });
    beto.player.socket.emit('player:answer', { roomCode, questionIndex: 0, optionIndex: RIGHT });
    await beto.player.next('question:reveal');

    for (const payload of [...host.received('question:start'), ...ana.player.received('question:start')]) {
      expect(JSON.stringify(payload)).not.toContain('correctIndex');
    }
    const anaLog = JSON.stringify(ana.player.events);
    expect(anaLog).not.toContain(hostToken);
    expect(anaLog).not.toContain(beto.playerId);
  });
});

describe('validation and authorization', () => {
  it('rejects invalid payloads with INVALID_PAYLOAD', async () => {
    const h = await startServer();
    const c = await client(h);
    c.socket.emit('host:create', { topic: 'X', count: 99, difficulty: 'medium' });
    expect(await errorCode(c, 0)).toBe('INVALID_PAYLOAD');
    const since = c.mark();
    c.socket.emit('player:join', { roomCode: 'nope', nickname: '' });
    expect(await errorCode(c, since)).toBe('INVALID_PAYLOAD');
  });

  it('a player cannot start or advance the game (NOT_HOST)', async () => {
    const h = await startServer();
    const { roomCode } = await createRoom(h);
    const ana = await join(h, roomCode, 'Ana');
    ana.player.socket.emit('host:start', { roomCode });
    expect(await errorCode(ana.player, 0)).toBe('NOT_HOST');
    expect(phaseOf(h, roomCode)).toBe('LOBBY');
  });

  it("a host cannot control another host's room", async () => {
    const h = await startServer();
    const roomA = await createRoom(h);
    const roomB = await createRoom(h);
    await join(h, roomB.roomCode, 'Ana');
    roomA.host.socket.emit('host:start', { roomCode: roomB.roomCode });
    expect(await errorCode(roomA.host, 0)).toBe('NOT_HOST');
    expect(phaseOf(h, roomB.roomCode)).toBe('LOBBY');
  });

  it('an unknown room code is ROOM_NOT_FOUND', async () => {
    const h = await startServer();
    const c = await client(h);
    c.socket.emit('player:join', { roomCode: 'ZZZZZZ', nickname: 'Ana' });
    expect(await errorCode(c, 0)).toBe('ROOM_NOT_FOUND');
  });

  it('a socket that never joined cannot answer', async () => {
    const h = await startServer();
    const { host, roomCode } = await createRoom(h);
    await join(h, roomCode, 'Ana');
    host.socket.emit('host:start', { roomCode });
    const intruder = await client(h);
    intruder.socket.emit('player:answer', { roomCode, questionIndex: 0, optionIndex: RIGHT });
    expect(await errorCode(intruder, 0)).toBe('PLAYER_NOT_FOUND');
  });
});

describe('host:rejoin with the host token', () => {
  it('rejects a wrong token with NOT_HOST', async () => {
    const h = await startServer();
    const { roomCode } = await createRoom(h);
    const impostor = await client(h);
    impostor.socket.emit('host:rejoin', { roomCode, hostToken: randomUUID() });
    expect(await errorCode(impostor, 0)).toBe('NOT_HOST');
    impostor.socket.emit('host:start', { roomCode });
    expect(await errorCode(impostor, 1)).toBe('NOT_HOST');
  });

  it('gives control back to a new socket with the right token', async () => {
    const h = await startServer();
    const { host, roomCode, hostToken } = await createRoom(h);
    const ana = await join(h, roomCode, 'Ana');
    host.socket.disconnect();
    const newHost = await client(h);
    newHost.socket.emit('host:rejoin', { roomCode, hostToken });
    expect(RoomStatePayloadSchema.parse(await newHost.next('room:state')).players).toHaveLength(1);
    newHost.socket.emit('host:start', { roomCode });
    await ana.player.next('question:start');
  });
});

describe('SPEC §3: a disconnected host does not break the game', () => {
  it('timers keep running, the room waits in REVEAL until host:rejoin + host:next', async () => {
    const h = await startServer();
    const { host, roomCode, hostToken } = await createRoom(h);
    const ana = await join(h, roomCode, 'Ana');
    const beto = await join(h, roomCode, 'Beto');
    host.socket.emit('host:start', { roomCode });
    await ana.player.next('question:start');
    host.socket.disconnect();

    ana.player.socket.emit('player:answer', { roomCode, questionIndex: 0, optionIndex: RIGHT });
    await vi.waitFor(() => {
      expect(h.registry.get(roomCode)?.answers).toHaveProperty(ana.playerId);
    });
    h.clock.now += QUESTION_TIME_MS;
    h.fireTimer();

    expect(QuestionRevealPayloadSchema.parse(await ana.player.next('question:reveal')).yourResult).toMatchObject({ correct: true });
    expect(QuestionRevealPayloadSchema.parse(await beto.player.next('question:reveal')).yourResult).toMatchObject({ correct: false });
    await settle();
    expect(phaseOf(h, roomCode)).toBe('REVEAL');
    expect(ana.player.received('leaderboard')).toHaveLength(0);

    const newHost = await client(h);
    newHost.socket.emit('host:rejoin', { roomCode, hostToken });
    expect(RoomStatePayloadSchema.parse(await newHost.next('room:state')).phase).toBe('REVEAL');
    expect(QuestionRevealPayloadSchema.parse(await newHost.next('question:reveal')).yourResult).toBeUndefined();

    newHost.socket.emit('host:next', { roomCode });
    await ana.player.next('leaderboard');
    expect(phaseOf(h, roomCode)).toBe('LEADERBOARD');
  });
});

describe('player reconnection', () => {
  it('a player that reloads keeps its nickname and score and gets the current question', async () => {
    const h = await startServer();
    const { host, roomCode } = await createRoom(h);
    const ana = await join(h, roomCode, 'Ana');
    await join(h, roomCode, 'Beto');
    host.socket.emit('host:start', { roomCode });
    await ana.player.next('question:start');
    ana.player.socket.disconnect();
    await vi.waitFor(() => {
      expect(h.registry.get(roomCode)?.players.find((p) => p.id === ana.playerId)?.connected).toBe(false);
    });

    const again = await join(h, roomCode, 'OtroNombre', ana.playerId);
    expect(again.joined).toEqual({ playerId: ana.playerId, nickname: 'Ana', waitingForNextQuestion: false });
    expect(QuestionStartPayloadSchema.parse(await again.player.next('question:start')).index).toBe(0);
    again.player.socket.emit('player:answer', { roomCode, questionIndex: 0, optionIndex: RIGHT });
    await vi.waitFor(() => {
      expect(h.registry.get(roomCode)?.answers).toHaveProperty(ana.playerId);
    });
  });

  it('the latest socket wins: an older socket of the same player can no longer answer', async () => {
    const h = await startServer();
    const { host, roomCode } = await createRoom(h);
    const ana = await join(h, roomCode, 'Ana');
    const second = await join(h, roomCode, 'Ana', ana.playerId);
    host.socket.emit('host:start', { roomCode });
    await second.player.next('question:start');
    const since = ana.player.mark();
    ana.player.socket.emit('player:answer', { roomCode, questionIndex: 0, optionIndex: RIGHT });
    expect(await errorCode(ana.player, since)).toBe('PLAYER_NOT_FOUND');
    expect(h.registry.get(roomCode)?.answers).toEqual({});
  });
});

describe('SPEC §3 Jugadores tardíos', () => {
  it('a player joining during QUESTION waits, cannot answer, and plays from the next question', async () => {
    const h = await startServer();
    const { host, roomCode } = await createRoom(h);
    const ana = await join(h, roomCode, 'Ana');
    host.socket.emit('host:start', { roomCode });
    await ana.player.next('question:start');

    const late = await join(h, roomCode, 'Tardío');
    expect(late.joined.waitingForNextQuestion).toBe(true);
    await settle();
    expect(late.player.received('question:start')).toHaveLength(0);

    late.player.socket.emit('player:answer', { roomCode, questionIndex: 0, optionIndex: RIGHT });
    expect(await errorCode(late.player, 0)).toBe('INVALID_PHASE');

    // The late joiner does not block REVEAL.
    ana.player.socket.emit('player:answer', { roomCode, questionIndex: 0, optionIndex: RIGHT });
    expect(QuestionRevealPayloadSchema.parse(await late.player.next('question:reveal')).yourResult).toBeUndefined();

    host.socket.emit('host:next', { roomCode });
    await late.player.next('leaderboard');
    host.socket.emit('host:next', { roomCode });
    expect(QuestionStartPayloadSchema.parse(await late.player.next('question:start')).index).toBe(1);
    const since = late.player.mark();
    late.player.socket.emit('player:answer', { roomCode, questionIndex: 1, optionIndex: RIGHT });
    ana.player.socket.emit('player:answer', { roomCode, questionIndex: 1, optionIndex: RIGHT });
    expect(QuestionRevealPayloadSchema.parse(await late.player.next('question:reveal', since)).yourResult).toMatchObject({
      correct: true,
      points: 1000,
    });
  });
});

describe('SPEC §3 Límites: 5 rooms per IP every 10 minutes', () => {
  async function createFrom(h: Harness, headers: Record<string, string>): Promise<string> {
    const c = await client(h, headers);
    c.socket.emit('host:create', { topic: 'Cultura general', count: 5, difficulty: 'easy' });
    return vi.waitFor(
      () => {
        const done = c.events.find((e) => e.event === 'host:created' || e.event === 'error');
        if (done === undefined) throw new Error('waiting');
        return done.event === 'error' ? ErrorPayloadSchema.parse(done.payload).code : 'CREATED';
      },
      { timeout: 2000, interval: 10 },
    );
  }

  it('without TRUST_PROXY, X-Forwarded-For is ignored: the 6th room from the socket IP is RATE_LIMITED', async () => {
    const h = await startServer({ trustProxy: false });
    for (let i = 0; i < 5; i++) expect(await createFrom(h, { 'x-forwarded-for': `203.0.113.${String(i)}` })).toBe('CREATED');
    expect(await createFrom(h, { 'x-forwarded-for': '198.51.100.1' })).toBe('RATE_LIMITED');
  });

  it('with TRUST_PROXY, the proxy-appended IP is used and spoofed first values do not help', async () => {
    const h = await startServer({ trustProxy: true });
    for (let i = 0; i < 5; i++) expect(await createFrom(h, { 'x-forwarded-for': `6.6.6.${String(i)}, 203.0.113.1` })).toBe('CREATED');
    expect(await createFrom(h, { 'x-forwarded-for': '203.0.113.1' })).toBe('RATE_LIMITED');
    expect(await createFrom(h, { 'x-forwarded-for': '203.0.113.2' })).toBe('CREATED');
  });
});

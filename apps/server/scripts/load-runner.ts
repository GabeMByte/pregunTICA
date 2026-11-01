import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { OPTIONS_PER_QUESTION, serverPayloadSchemas, type ClientToServerEvents, type ServerToClientEvents } from '@preguntica/shared';
import type { LoadResult } from './load-report.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface LoadOptions {
  url: string;
  /** One of the server's WARM_TOPICS, so the room comes from the cache and spends no API. */
  topic: string;
  players: number;
  /** Each bot answers each question after a random delay in this range. */
  minDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
  random: () => number;
  /** Progress lines; silent by default. */
  log?: (line: string) => void;
}

/** What WARM_TOPICS warms (cached-question-source.ts): anything else misses the cache. */
const WARM_REQUEST = { count: 5, difficulty: 'medium', language: 'es' } as const;

/** After the host's game:end, how long the bots get to receive theirs. */
const END_GRACE_MS = 3_000;

/**
 * Plays one full game against `url`: a host socket creates the room and advances every phase like
 * the projector would, and `players` bot sockets join and answer each question after a random
 * delay. Never throws: every failure ends up in the result's errors.
 */
export function runLoadTest(options: LoadOptions): Promise<LoadResult> {
  const { url, topic, players, minDelayMs, maxDelayMs, random } = options;
  const log = options.log ?? (() => undefined);
  const startedAt = performance.now();
  const now = () => performance.now() - startedAt;

  const connect = (): Client => io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  const host = connect();
  const bots: Client[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (callback: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      callback();
    }, ms);
    timers.add(timer);
  };

  const result: LoadResult = {
    url,
    topic,
    players,
    joined: 0,
    lobbyMs: null,
    questionOrigin: null,
    joinMs: [],
    startLatencyMs: [],
    missedStarts: 0,
    answersSent: [],
    answersCounted: [],
    errors: {},
    finished: false,
    playersFinished: 0,
    durationMs: 0,
  };
  const fail = (key: string) => {
    result.errors[key] = (result.errors[key] ?? 0) + 1;
  };

  let roomCode = '';
  let totalQuestions = 0;
  let joinsSettled = 0;
  let started = false;
  let advancedFrom = '';
  /** Per question: when the host got question:start, and when each bot did (in arrival order). */
  const hostStart: number[] = [];
  const botStarts: number[][] = [];
  /** Per question: closed once the host gets question:reveal; later answers are not "sent in time". */
  const closed: boolean[] = [];

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      for (const timer of timers) clearTimeout(timer);
      for (const bot of bots) bot.disconnect();
      host.disconnect();

      // Latency is paired by question; a bot start without the host's is still counted as received.
      botStarts.forEach((starts, index) => {
        const hostAt = hostStart[index];
        if (hostAt !== undefined) result.startLatencyMs.push(...starts.map((at) => at - hostAt));
      });
      const received = botStarts.reduce((count, starts) => count + starts.length, 0);
      result.missedStarts = Math.max(0, result.joined * totalQuestions - received);
      result.durationMs = now();
      resolve(result);
    };
    later(() => {
      fail('timeout');
      finish();
    }, options.timeoutMs);

    const maybeStart = () => {
      if (started || joinsSettled < players) return;
      started = true;
      log(`${String(result.joined)}/${String(players)} joined, starting`);
      host.emit('host:start', { roomCode });
    };

    const joinBot = (number: number) => {
      const bot = connect();
      bots.push(bot);
      let joinSentAt = 0;
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        joinsSettled += 1;
        maybeStart();
      };

      bot.on('connect', () => {
        joinSentAt = now();
        bot.emit('player:join', { roomCode, nickname: `Bot ${String(number)}`, playerId: randomUUID() });
      });
      bot.on('connect_error', () => {
        fail('player connect_error');
        settle();
      });
      bot.on('disconnect', (reason) => {
        if (!done && reason !== 'io client disconnect') fail(`player disconnect (${reason})`);
      });
      bot.on('error', (payload) => {
        fail(`player ${serverPayloadSchemas.error.parse(payload).code}`);
        settle();
      });
      bot.on('player:joined', () => {
        result.joined += 1;
        result.joinMs.push(now() - joinSentAt);
        settle();
      });
      bot.on('question:start', (payload) => {
        const question = serverPayloadSchemas['question:start'].parse(payload);
        (botStarts[question.index] ??= []).push(now());
        const delay = minDelayMs + random() * (maxDelayMs - minDelayMs);
        later(() => {
          if (closed[question.index] === true) return;
          result.answersSent[question.index] = (result.answersSent[question.index] ?? 0) + 1;
          const optionIndex = Math.floor(random() * OPTIONS_PER_QUESTION);
          bot.emit('player:answer', { roomCode, questionIndex: question.index, optionIndex });
        }, delay);
      });
      bot.on('game:end', () => {
        result.playersFinished += 1;
        if (result.finished && result.playersFinished === result.joined) finish();
      });
    };

    host.on('connect', () => {
      host.emit('host:create', { topic, ...WARM_REQUEST });
    });
    host.on('connect_error', () => {
      fail('host connect_error');
      finish();
    });
    host.on('disconnect', (reason) => {
      if (!done && reason !== 'io client disconnect') {
        fail(`host disconnect (${reason})`);
        finish();
      }
    });
    host.on('error', (payload) => {
      fail(`host ${serverPayloadSchemas.error.parse(payload).code}`);
      // Before the lobby nothing can be played (a rejected topic, the room limit...).
      if (result.lobbyMs === null) finish();
    });
    host.on('host:created', (payload) => {
      roomCode = serverPayloadSchemas['host:created'].parse(payload).roomCode;
      log(`Room ${roomCode}, waiting for the questions…`);
    });
    host.on('room:state', (payload) => {
      const state = serverPayloadSchemas['room:state'].parse(payload);
      totalQuestions = state.totalQuestions;
      if (state.phase === 'LOBBY' && result.lobbyMs === null) {
        result.lobbyMs = now();
        result.questionOrigin = state.questionOrigin ?? null;
        log(`LOBBY after ${String(Math.round(result.lobbyMs))} ms (questionOrigin: ${String(result.questionOrigin)}), joining ${String(players)} bots`);
        for (let number = 1; number <= players; number += 1) joinBot(number);
      }
      // The projector's part: advance once from each REVEAL and LEADERBOARD.
      const step = `${state.phase}:${String(state.questionIndex)}`;
      if ((state.phase === 'REVEAL' || state.phase === 'LEADERBOARD') && advancedFrom !== step) {
        advancedFrom = step;
        host.emit('host:next', { roomCode });
      }
    });
    host.on('question:start', (payload) => {
      const { index } = serverPayloadSchemas['question:start'].parse(payload);
      hostStart[index] = now();
      result.answersSent[index] ??= 0;
      log(`Question ${String(index + 1)}/${String(totalQuestions)}`);
    });
    host.on('question:reveal', (payload) => {
      const { distribution } = serverPayloadSchemas['question:reveal'].parse(payload);
      const index = hostStart.length - 1;
      closed[index] = true;
      result.answersCounted[index] = distribution.reduce((total, votes) => total + votes, 0);
    });
    host.on('game:end', () => {
      result.finished = true;
      log('Game over');
      if (result.playersFinished === result.joined) finish();
      else later(finish, END_GRACE_MS);
    });
  });
}

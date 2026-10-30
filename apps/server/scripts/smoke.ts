/**
 * pnpm smoke --topic "Volcanes de Costa Rica" [--language en] [--count 5] [--difficulty medium] [--url http://localhost:3000]
 *
 * Manual smoke test against a running server (pnpm dev). With ANTHROPIC_API_KEY in the server's
 * .env this spends REAL API calls: only the user runs it, never CI or Claude. Creates a room, prints
 * questionOrigin and the time until LOBBY, then plays the game with one bot player that answers at
 * once, so every question is printed with its correct answer. A rejected topic prints the error.
 */
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { io, type Socket } from 'socket.io-client';
import { HostCreatePayloadSchema, serverPayloadSchemas, type ClientToServerEvents, type ServerToClientEvents } from '@preguntica/shared';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Generation (15 s timeout + fallback) plus a 5-question game with instant answers. */
const OVERALL_TIMEOUT_MS = 60_000;

const { values } = parseArgs({
  // pnpm may forward the "--" separator itself.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    topic: { type: 'string' },
    language: { type: 'string', default: 'es' },
    count: { type: 'string', default: '5' },
    difficulty: { type: 'string', default: 'medium' },
    url: { type: 'string', default: 'http://localhost:3000' },
  },
});

const create = HostCreatePayloadSchema.safeParse({
  topic: values.topic,
  count: Number(values.count),
  difficulty: values.difficulty,
  language: values.language,
});
if (!create.success) {
  console.error('Usage: pnpm smoke --topic "<tema>" [--language es|en] [--count 1-15] [--difficulty easy|medium|hard]');
  console.error(create.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`).join('\n'));
  process.exit(1);
}

const connect = (): Client => io(values.url, { transports: ['websocket'], forceNew: true, reconnection: false });
const host = connect();
let player: Client | undefined;

function finish(code: number): never {
  host.disconnect();
  player?.disconnect();
  process.exit(code);
}

setTimeout(() => {
  console.error(`No end of game after ${String(OVERALL_TIMEOUT_MS / 1000)} s.`);
  finish(1);
}, OVERALL_TIMEOUT_MS).unref();

host.on('connect_error', (error) => {
  console.error(`Cannot connect to ${values.url}: ${error.message}. Is the server running (pnpm dev)?`);
  finish(1);
});

let roomCode = '';
let startedAt = 0;
let lobbyReached = false;
let advancedFrom = '';
let current: { prompt: string; options: string[] } | undefined;

host.on('connect', () => {
  startedAt = performance.now();
  console.log(`Creating a room: "${create.data.topic}" (${create.data.language}, ${String(create.data.count)} questions, ${create.data.difficulty})`);
  host.emit('host:create', create.data);
});

host.on('host:created', (payload) => {
  roomCode = serverPayloadSchemas['host:created'].parse(payload).roomCode;
  console.log(`Room ${roomCode}, generating...`);
});

host.on('error', (payload) => {
  const { code, message } = serverPayloadSchemas.error.parse(payload);
  console.error(`\nError ${code}: ${message} (after ${String(Math.round(performance.now() - startedAt))} ms)`);
  finish(code === 'TOPIC_REJECTED' ? 2 : 1);
});

host.on('room:state', (payload) => {
  const state = serverPayloadSchemas['room:state'].parse(payload);
  if (state.phase === 'LOBBY' && !lobbyReached) {
    lobbyReached = true;
    console.log(`LOBBY after ${String(Math.round(performance.now() - startedAt))} ms, questionOrigin: ${String(state.questionOrigin)}\n`);
    joinBot();
  }
  // REVEAL → LEADERBOARD → next question: the host advances once per phase and question.
  const step = `${state.phase}:${String(state.questionIndex)}`;
  if ((state.phase === 'REVEAL' || state.phase === 'LEADERBOARD') && advancedFrom !== step) {
    advancedFrom = step;
    host.emit('host:next', { roomCode });
  }
});

host.on('question:reveal', (payload) => {
  const { correctIndex, explanation } = serverPayloadSchemas['question:reveal'].parse(payload);
  console.log(`   ✔ ${current?.options[correctIndex] ?? `option ${String(correctIndex)}`}\n   ${explanation}\n`);
});

host.on('game:end', () => {
  console.log('Game over.');
  finish(0);
});

function joinBot(): void {
  const bot = connect();
  player = bot;
  bot.on('connect', () => {
    bot.emit('player:join', { roomCode, nickname: 'Smoke', playerId: randomUUID() });
  });
  bot.on('player:joined', () => {
    host.emit('host:start', { roomCode });
  });
  bot.on('question:start', (payload) => {
    const question = serverPayloadSchemas['question:start'].parse(payload);
    current = question;
    console.log(`${String(question.index + 1)}/${String(question.total)} ${question.prompt}`);
    question.options.forEach((option, i) => {
      console.log(`   ${'ABCD'[i] ?? '?'}) ${option}`);
    });
    // The only player answers at once, so the question goes straight to REVEAL.
    bot.emit('player:answer', { roomCode, questionIndex: question.index, optionIndex: 0 });
  });
}

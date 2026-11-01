/**
 * pnpm load --url https://NOMBRE.onrender.com --topic "Volcanes de Costa Rica" [--players 50] [--min-delay 500] [--max-delay 8000]
 *
 * Load test against a running server: a host socket creates a room and plays a full game with
 * `players` bot sockets that answer after a random delay, then prints join time, question:start
 * latency between the host and the players, lost answers and errors. Only the user runs it, never
 * CI or Claude (.claude/settings.json).
 *
 * The topic must be one of the server's WARM_TOPICS: the room is created like the warm-up
 * (Spanish, 5 questions, medium), so it comes from the cache. Any other topic is generated, and
 * with ANTHROPIC_API_KEY on the server that spends REAL API calls. Without --topic, the first
 * entry of the WARM_TOPICS variable in this shell is used.
 */
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { MAX_PLAYERS, QUESTION_TIME_MS, TopicSchema } from '@preguntica/shared';
import { formatReport, loadExitCode } from './load-report.js';
import { runLoadTest } from './load-runner.js';

/** An answer must leave before the question closes, with room for the network. */
const MAX_DELAY_MS = QUESTION_TIME_MS - 3_000;

const { values } = parseArgs({
  // pnpm may forward the "--" separator itself.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    url: { type: 'string' },
    topic: { type: 'string' },
    players: { type: 'string', default: String(MAX_PLAYERS) },
    'min-delay': { type: 'string', default: '500' },
    'max-delay': { type: 'string', default: '8000' },
    timeout: { type: 'string', default: '240' },
  },
});

const ArgsSchema = z
  .object({
    url: z.url({ protocol: /^https?$/ }),
    topic: TopicSchema,
    players: z.coerce.number().int().min(1).max(MAX_PLAYERS),
    minDelayMs: z.coerce.number().int().min(0),
    maxDelayMs: z.coerce.number().int().max(MAX_DELAY_MS),
    timeoutSeconds: z.coerce.number().int().positive(),
  })
  .refine((args) => args.minDelayMs <= args.maxDelayMs, { message: '--min-delay must not exceed --max-delay', path: ['minDelayMs'] });

const args = ArgsSchema.safeParse({
  url: values.url,
  topic: values.topic ?? process.env.WARM_TOPICS?.split(',').find((entry) => entry.trim() !== ''),
  players: values.players,
  minDelayMs: values['min-delay'],
  maxDelayMs: values['max-delay'],
  timeoutSeconds: values.timeout,
});
if (!args.success) {
  console.error(
    `Usage: pnpm load --url <https://…> --topic "<one of the server's WARM_TOPICS>" [--players 1-${String(MAX_PLAYERS)}] [--min-delay ms] [--max-delay ms ≤ ${String(MAX_DELAY_MS)}] [--timeout s]`,
  );
  console.error(args.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`).join('\n'));
  process.exit(1);
}

const { url, topic, players, minDelayMs, maxDelayMs, timeoutSeconds } = args.data;
console.log(`Topic "${topic}" (es, 5 questions, medium): it must be in the server's WARM_TOPICS, or the server generates it.\n`);

const result = await runLoadTest({
  url,
  topic,
  players,
  minDelayMs,
  maxDelayMs,
  timeoutMs: timeoutSeconds * 1000,
  random: Math.random,
  log: (line) => {
    console.log(line);
  },
});
console.log(`\n${formatReport(result)}`);
process.exit(loadExitCode(result));

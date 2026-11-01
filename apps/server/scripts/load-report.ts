import { percentile } from './eval-summary.js';

/** What one load run measured (scripts/load.ts). */
export interface LoadResult {
  url: string;
  topic: string;
  players: number;
  /** Bots that got player:joined. */
  joined: number;
  /** From host:create to the first LOBBY; null if it never got there. */
  lobbyMs: number | null;
  questionOrigin: string | null;
  /** Per bot: player:join sent → player:joined received. */
  joinMs: number[];
  /** Per bot and question: its question:start minus the host's (same machine, same clock). */
  startLatencyMs: number[];
  /** question:start events a joined bot never received. */
  missedStarts: number;
  /** Per question: answers sent before the question closed. */
  answersSent: number[];
  /** Per question: answers the reveal counted (sum of its distribution). */
  answersCounted: number[];
  /** By source and code, e.g. "player INVALID_PHASE", "host connect_error", "timeout". */
  errors: Record<string, number>;
  /** The host got game:end. */
  finished: boolean;
  /** Bots that got game:end. */
  playersFinished: number;
  durationMs: number;
}

/** A cached room is ready almost at once; a real generation takes seconds. */
const CACHE_HIT_MAX_MS = 1_500;

export function lostAnswers({ answersSent, answersCounted }: LoadResult): number[] {
  return answersSent.map((sent, index) => Math.max(0, sent - (answersCounted[index] ?? 0)));
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

function distribution(values: readonly number[]): string {
  if (values.length === 0) return 'no data';
  const ms = (value: number) => `${String(Math.round(value))} ms`;
  return `p50 ${ms(percentile(values, 50))} · p95 ${ms(percentile(values, 95))} · max ${ms(Math.max(...values))} (n=${String(values.length)})`;
}

export function formatReport(result: LoadResult): string {
  const lost = lostAnswers(result);
  const lostDetail = lost.flatMap((count, index) => (count > 0 ? [`Q${String(index + 1)}: ${String(count)}`] : [])).join(', ');
  const errors = Object.entries(result.errors).sort(([, a], [, b]) => b - a);

  const lines = [
    `Load test against ${result.url}: "${result.topic}", ${String(result.players)} players, ${String(Math.round(result.durationMs / 1000))} s`,
    `LOBBY after ${result.lobbyMs === null ? 'never' : `${String(Math.round(result.lobbyMs))} ms`}, questionOrigin: ${String(result.questionOrigin)}`,
  ];
  if (result.questionOrigin === 'fallback') lines.push('  ! Questions came from the local bank, not the cache: is the topic in WARM_TOPICS?');
  else if (result.lobbyMs !== null && result.lobbyMs > CACHE_HIT_MAX_MS) {
    lines.push('  ! The room took long to be ready: the topic was probably not in the WARM_TOPICS cache, so it may have called the API.');
  }
  lines.push(
    `Joined: ${String(result.joined)}/${String(result.players)}`,
    `Join time: ${distribution(result.joinMs)}`,
    `question:start latency (player − host): ${distribution(result.startLatencyMs)}`,
    `Missed question:start: ${String(result.missedStarts)}`,
    `Answers: ${String(sum(result.answersSent))} sent, ${String(sum(result.answersCounted))} counted, ${String(sum(lost))} lost${lostDetail === '' ? '' : ` (${lostDetail})`}`,
    `Game over: host ${result.finished ? 'yes' : 'NO'}, players ${String(result.playersFinished)}/${String(result.joined)}`,
    errors.length === 0 ? 'Errors: none' : `Errors:\n${errors.map(([key, count]) => `  ${key}: ${String(count)}`).join('\n')}`,
  );
  return lines.join('\n');
}

/** 0 only when every bot joined, played every question, every answer counted and nothing failed. */
export function loadExitCode(result: LoadResult): number {
  const clean =
    result.finished &&
    result.joined === result.players &&
    result.playersFinished === result.joined &&
    result.missedStarts === 0 &&
    sum(lostAnswers(result)) === 0 &&
    Object.keys(result.errors).length === 0;
  return clean ? 0 : 1;
}

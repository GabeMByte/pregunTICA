/**
 * Test fixtures for the engine. Fixture builders only: no assertions about behavior.
 * Time is always injected: tests use fixed `now` values, never real clocks or timers.
 */
import { expect } from 'vitest';
import type { ErrorCode, Question } from '@preguntica/shared';
import { createGame, reduce } from './game.js';
import type { EngineResult, GameState, NewGame, Player } from './types.js';

/** Base timestamp for every test. */
export const NOW = 1_000_000;

export const ROOM_CODE = 'ABC234';

/** Deterministic UUID-shaped player id: playerId(1) → '00000000-0000-4000-8000-000000000001'. */
export function playerId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export function nickname(n: number): string {
  return `Player${String(n)}`;
}

/**
 * Valid questions with distinct options. correctIndex cycles 0,1,2,3 unless
 * `correctIndexes` overrides it.
 */
export function makeQuestions(n: number, correctIndexes: readonly number[] = []): Question[] {
  return Array.from({ length: n }, (_, i) => ({
    prompt: `Question number ${String(i + 1)}?`,
    options: [`Q${String(i + 1)} option A`, `Q${String(i + 1)} option B`, `Q${String(i + 1)} option C`, `Q${String(i + 1)} option D`],
    correctIndex: correctIndexes[i] ?? i % 4,
    explanation: `Explanation for question ${String(i + 1)}.`,
  }));
}

export function newGame(overrides: Partial<NewGame> = {}): NewGame {
  return { code: ROOM_CODE, topic: 'Costa Rica', difficulty: 'medium', count: 5, ...overrides };
}

/** Asserts the result is ok and returns the new state. */
export function ok(result: EngineResult): GameState {
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) throw new Error(`Expected ok result, got error ${result.error}`);
  return result.state;
}

/** Asserts the result is an error and returns its code. */
export function err(result: EngineResult): ErrorCode {
  expect(result).toMatchObject({ ok: false });
  if (result.ok) throw new Error('Expected error result, got ok');
  return result.error;
}

/** Element at index or a thrown error (avoids non-null assertions). */
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`No element at index ${String(index)}`);
  return item;
}

export function findPlayer(state: GameState, id: string): Player {
  const player = state.players.find((p) => p.id === id);
  if (player === undefined) throw new Error(`Player ${id} not found`);
  return player;
}

/** Game in GENERATING with players 1..n joined (no questions yet). */
export function makeGeneratingGame(players: number, now = NOW): GameState {
  let state = createGame(newGame());
  for (let i = 1; i <= players; i++) {
    state = ok(reduce(state, { type: 'join', playerId: playerId(i), nickname: nickname(i) }, now));
  }
  return state;
}

/** Game in LOBBY with `questions` loaded and players 1..n joined. */
export function makeLobbyGame(players: number, questions: Question[] = makeQuestions(5), now = NOW): GameState {
  let state = createGame(newGame({ count: questions.length }));
  state = ok(reduce(state, { type: 'questionsReady', origin: 'ai', questions }, now));
  for (let i = 1; i <= players; i++) {
    state = ok(reduce(state, { type: 'join', playerId: playerId(i), nickname: nickname(i) }, now));
  }
  return state;
}

/** Game in QUESTION (index 0, started at `now`) with players 1..n. */
export function makeStartedGame(players: number, questions: Question[] = makeQuestions(5), now = NOW): GameState {
  return ok(reduce(makeLobbyGame(players, questions, now), { type: 'start' }, now));
}

/** Recursively freezes an object so any mutation throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

export function makePlayer(n: number, overrides: Partial<Player> = {}): Player {
  return {
    id: playerId(n),
    nickname: nickname(n),
    score: 0,
    streak: 0,
    connected: true,
    lastResult: null,
    eligibleFrom: 0,
    ...overrides,
  };
}

/** Plain GameState literal (no reducer involved), for view tests. Defaults to LOBBY with 5 questions. */
export function makeState(overrides: Partial<GameState> = {}): GameState {
  const questions = overrides.questions ?? makeQuestions(5);
  return {
    code: ROOM_CODE,
    topic: 'Costa Rica',
    difficulty: 'medium',
    totalQuestions: questions.length,
    phase: 'LOBBY',
    questions,
    players: [],
    questionIndex: null,
    questionStartedAt: null,
    questionEndsAt: null,
    answers: {},
    questionOrigin: overrides.phase === 'GENERATING' ? null : 'ai',
    ...overrides,
  };
}

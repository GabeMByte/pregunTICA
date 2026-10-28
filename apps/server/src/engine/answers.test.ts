import { describe, expect, it } from 'vitest';
import { QUESTION_TIME_MS } from '@preguntica/shared';
import { reduce } from './game.js';
import type { GameState } from './types.js';
import { NOW, err, findPlayer, makeQuestions, makeStartedGame, ok, playerId } from './test-helpers.js';

const T = QUESTION_TIME_MS;
/** Every question has the correct answer at index 0, so 0 = right and 1 = wrong. */
const RIGHT = 0;
const WRONG = 1;

function game(players: number): GameState {
  return makeStartedGame(players, makeQuestions(5, [0, 0, 0, 0, 0]));
}

function answer(state: GameState, player: number, optionIndex: number, now: number, questionIndex = state.questionIndex ?? -1) {
  return reduce(state, { type: 'answer', playerId: playerId(player), questionIndex, optionIndex }, now);
}

function startedAt(state: GameState): number {
  if (state.questionStartedAt === null) throw new Error('questionStartedAt not set');
  return state.questionStartedAt;
}

/** REVEAL → LEADERBOARD → next QUESTION. */
function nextQuestion(state: GameState, now: number): GameState {
  const leaderboard = ok(reduce(state, { type: 'next' }, now));
  return ok(reduce(leaderboard, { type: 'next' }, now));
}

describe('SPEC §3 QUESTION: recording answers', () => {
  it('stores the option and the elapsed time since question start', () => {
    const state = ok(answer(game(2), 1, 2, NOW + 1234));
    expect(state.phase).toBe('QUESTION');
    expect(state.answers).toEqual({ [playerId(1)]: { optionIndex: 2, elapsedMs: 1234 } });
  });

  it('accepts an answer exactly at questionEndsAt', () => {
    const state = ok(answer(game(2), 1, 3, NOW + T));
    expect(state.answers[playerId(1)]).toEqual({ optionIndex: 3, elapsedMs: T });
  });
});

describe('SPEC §3 Puntaje: only the first answer of each player counts', () => {
  it('ignores a second answer and leaves the state unchanged', () => {
    const first = ok(answer(game(2), 1, 1, NOW + 100));
    const second = ok(answer(first, 1, 0, NOW + 200));
    expect(second).toEqual(first);
    expect(second.answers[playerId(1)]).toEqual({ optionIndex: 1, elapsedMs: 100 });
  });
});

describe('SPEC §3 QUESTION: invalid answers', () => {
  it('rejects an answer 1 ms after questionEndsAt with INVALID_PHASE', () => {
    expect(err(answer(game(2), 1, 0, NOW + T + 1))).toBe('INVALID_PHASE');
  });

  it('rejects an answer for a different question index with INVALID_PHASE', () => {
    expect(err(answer(game(2), 1, 0, NOW + 10, 1))).toBe('INVALID_PHASE');
  });

  it.each(['REVEAL', 'LEADERBOARD'] as const)('rejects an answer in %s with INVALID_PHASE', (phase) => {
    let state = ok(reduce(game(1), { type: 'timeUp' }, NOW + T));
    if (phase === 'LEADERBOARD') state = ok(reduce(state, { type: 'next' }, NOW + T + 1));
    expect(state.phase).toBe(phase);
    expect(err(answer(state, 1, 0, NOW + T + 2, 0))).toBe('INVALID_PHASE');
  });

  it('rejects an unknown player with PLAYER_NOT_FOUND', () => {
    expect(err(answer(game(2), 42, 0, NOW + 10))).toBe('PLAYER_NOT_FOUND');
  });
});

describe('SPEC §3 QUESTION → REVEAL when everyone answered', () => {
  it('stays in QUESTION until the last connected player answers, then moves to REVEAL', () => {
    let state = ok(answer(game(2), 1, 0, NOW + 10));
    expect(state.phase).toBe('QUESTION');
    state = ok(answer(state, 2, 1, NOW + 20));
    expect(state.phase).toBe('REVEAL');
  });

  it('does not wait for disconnected players', () => {
    let state = ok(reduce(game(3), { type: 'disconnect', playerId: playerId(3) }, NOW + 1));
    state = ok(answer(state, 1, 0, NOW + 10));
    expect(state.phase).toBe('QUESTION');
    state = ok(answer(state, 2, 0, NOW + 20));
    expect(state.phase).toBe('REVEAL');
  });

  it('moves to REVEAL when the only pending player disconnects', () => {
    let state = ok(answer(game(2), 1, 0, NOW + 10));
    state = ok(reduce(state, { type: 'disconnect', playerId: playerId(2) }, NOW + 20));
    expect(state.phase).toBe('REVEAL');
  });

  it('stays in QUESTION when a player disconnects but others still have to answer', () => {
    const state = ok(reduce(game(3), { type: 'disconnect', playerId: playerId(3) }, NOW + 20));
    expect(state.phase).toBe('QUESTION');
  });
});

describe('SPEC §3 Puntaje: scoring applied on entering REVEAL', () => {
  it('scores a correct answer using its elapsed time (10000 ms → 750)', () => {
    const state = ok(answer(game(1), 1, RIGHT, NOW + 10_000));
    expect(findPlayer(state, playerId(1))).toMatchObject({
      score: 750,
      streak: 1,
      lastResult: { correct: true, points: 750, streak: 1, totalScore: 750 },
    });
  });

  it('gives 0 and resets the streak for a wrong answer', () => {
    const state = ok(answer(game(1), 1, WRONG, NOW));
    expect(findPlayer(state, playerId(1))).toMatchObject({
      score: 0,
      streak: 0,
      lastResult: { correct: false, points: 0, streak: 0, totalScore: 0 },
    });
  });

  it('gives 0 and lastResult {correct:false} to players who did not answer (timeUp)', () => {
    let state = ok(answer(game(2), 1, RIGHT, NOW));
    state = ok(reduce(state, { type: 'timeUp' }, NOW + T));
    expect(state.phase).toBe('REVEAL');
    expect(findPlayer(state, playerId(1)).lastResult).toEqual({ correct: true, points: 1000, streak: 1, totalScore: 1000 });
    expect(findPlayer(state, playerId(2))).toMatchObject({
      score: 0,
      streak: 0,
      lastResult: { correct: false, points: 0, streak: 0, totalScore: 0 },
    });
  });

  it('scores everyone when REVEAL is reached by a disconnect', () => {
    let state = ok(answer(game(2), 1, RIGHT, NOW + 10_000));
    state = ok(reduce(state, { type: 'disconnect', playerId: playerId(2) }, NOW + 10_001));
    expect(findPlayer(state, playerId(1)).lastResult).toEqual({ correct: true, points: 750, streak: 1, totalScore: 750 });
    expect(findPlayer(state, playerId(2)).lastResult).toEqual({ correct: false, points: 0, streak: 0, totalScore: 0 });
  });

  it('carries the streak across questions: correct twice at t = 0 → 1000 then 1100', () => {
    let state = ok(answer(game(1), 1, RIGHT, NOW));
    const t2 = NOW + 2 * T;
    state = nextQuestion(state, t2);
    expect(state.questionIndex).toBe(1);
    expect(startedAt(state)).toBe(t2);
    state = ok(answer(state, 1, RIGHT, t2));
    expect(findPlayer(state, playerId(1))).toMatchObject({
      score: 2100,
      streak: 2,
      lastResult: { correct: true, points: 1100, streak: 2, totalScore: 2100 },
    });
  });

  it('resets the streak after a missed question and keeps the accumulated score', () => {
    // Q0 correct (1000), Q1 no answer (timeUp), Q2 correct again → streak 1, no bonus.
    let state = ok(answer(game(2), 1, RIGHT, NOW));
    state = ok(answer(state, 2, RIGHT, NOW));
    let now = NOW + 2 * T;
    state = nextQuestion(state, now);
    state = ok(answer(state, 2, RIGHT, now));
    now += T;
    state = ok(reduce(state, { type: 'timeUp' }, now));
    expect(findPlayer(state, playerId(1))).toMatchObject({
      score: 1000,
      streak: 0,
      lastResult: { correct: false, points: 0, streak: 0, totalScore: 1000 },
    });
    now += T;
    state = nextQuestion(state, now);
    state = ok(answer(state, 1, RIGHT, now));
    state = ok(answer(state, 2, RIGHT, now));
    expect(findPlayer(state, playerId(1)).lastResult).toEqual({ correct: true, points: 1000, streak: 1, totalScore: 2000 });
    expect(findPlayer(state, playerId(2)).lastResult).toEqual({ correct: true, points: 1200, streak: 3, totalScore: 3300 });
  });
});

import { describe, expect, it } from 'vitest';
import { QUESTION_TIME_MS } from '@preguntica/shared';
import { createGame, reduce } from './game.js';
import type { GameState } from './types.js';
import {
  NOW,
  deepFreeze,
  err,
  makeGeneratingGame,
  makeLobbyGame,
  makePlayer,
  makeQuestions,
  makeStartedGame,
  makeState,
  newGame,
  ok,
  playerId,
} from './test-helpers.js';

const T = QUESTION_TIME_MS;

/** QUESTION 0 → REVEAL via timeUp at exactly endsAt. */
function toReveal(state: GameState): GameState {
  if (state.questionEndsAt === null) throw new Error('questionEndsAt not set');
  return ok(reduce(state, { type: 'timeUp' }, state.questionEndsAt));
}

function revealGame(players = 1, questions = makeQuestions(5)): GameState {
  return toReveal(makeStartedGame(players, questions));
}

function leaderboardGame(players = 1, questions = makeQuestions(5)): GameState {
  return ok(reduce(revealGame(players, questions), { type: 'next' }, NOW + T + 1000));
}

describe('SPEC §3 Máquina de estados: GENERATING → LOBBY on questionsReady', () => {
  it('moves to LOBBY and stores the questions', () => {
    const questions = makeQuestions(5);
    const state = ok(reduce(createGame(newGame({ count: 5 })), { type: 'questionsReady', questions }, NOW));
    expect(state.phase).toBe('LOBBY');
    expect(state.questions).toEqual(questions);
    expect(state.totalQuestions).toBe(5);
    expect(state.questionIndex).toBeNull();
  });

  it('sets totalQuestions to the number of questions actually received', () => {
    const state = ok(reduce(createGame(newGame({ count: 10 })), { type: 'questionsReady', questions: makeQuestions(7) }, NOW));
    expect(state.totalQuestions).toBe(7);
  });

  it('keeps players who joined during GENERATING', () => {
    const state = ok(reduce(makeGeneratingGame(3), { type: 'questionsReady', questions: makeQuestions(5) }, NOW));
    expect(state.players.map((p) => p.id)).toEqual([playerId(1), playerId(2), playerId(3)]);
  });

  it('rejects an empty question list with INVALID_PAYLOAD', () => {
    expect(err(reduce(createGame(newGame()), { type: 'questionsReady', questions: [] }, NOW))).toBe('INVALID_PAYLOAD');
  });

  it.each(['LOBBY', 'QUESTION', 'REVEAL', 'LEADERBOARD', 'PODIUM'] as const)('rejects questionsReady in %s with INVALID_PHASE', (phase) => {
    const state = makeState({ phase, players: [makePlayer(1)], questionIndex: phase === 'LOBBY' ? null : 0, questionStartedAt: NOW, questionEndsAt: NOW + T });
    expect(err(reduce(state, { type: 'questionsReady', questions: makeQuestions(5) }, NOW))).toBe('INVALID_PHASE');
  });

  it('does not mutate the input state', () => {
    const state = deepFreeze(createGame(newGame()));
    const snapshot = structuredClone(state);
    ok(reduce(state, { type: 'questionsReady', questions: makeQuestions(5) }, NOW));
    expect(state).toEqual(snapshot);
  });
});

describe('SPEC §3 Máquina de estados: LOBBY → QUESTION on start', () => {
  it('rejects start in GENERATING with QUESTIONS_NOT_READY', () => {
    expect(err(reduce(makeGeneratingGame(2), { type: 'start' }, NOW))).toBe('QUESTIONS_NOT_READY');
  });

  it('rejects start in LOBBY with no players with NO_PLAYERS', () => {
    expect(err(reduce(makeLobbyGame(0), { type: 'start' }, NOW))).toBe('NO_PLAYERS');
  });

  it('rejects start in LOBBY when every player is disconnected with NO_PLAYERS', () => {
    let state = makeLobbyGame(2);
    state = ok(reduce(state, { type: 'disconnect', playerId: playerId(1) }, NOW));
    state = ok(reduce(state, { type: 'disconnect', playerId: playerId(2) }, NOW));
    expect(err(reduce(state, { type: 'start' }, NOW))).toBe('NO_PLAYERS');
  });

  it('starts the first question with exactly one connected player', () => {
    const state = ok(reduce(makeLobbyGame(1), { type: 'start' }, NOW));
    expect(state).toMatchObject({
      phase: 'QUESTION',
      questionIndex: 0,
      questionStartedAt: NOW,
      questionEndsAt: NOW + T,
      answers: {},
    });
  });

  it('starts when at least one player is connected even if others are disconnected', () => {
    let state = makeLobbyGame(2);
    state = ok(reduce(state, { type: 'disconnect', playerId: playerId(1) }, NOW));
    expect(ok(reduce(state, { type: 'start' }, NOW + 5)).phase).toBe('QUESTION');
  });

  it('uses the injected now for the timer (now = 0 edge)', () => {
    const state = ok(reduce(makeLobbyGame(1, makeQuestions(5), 0), { type: 'start' }, 0));
    expect(state.questionStartedAt).toBe(0);
    expect(state.questionEndsAt).toBe(T);
  });

  it.each(['QUESTION', 'REVEAL', 'LEADERBOARD', 'PODIUM'] as const)('rejects start in %s with INVALID_PHASE', (phase) => {
    const state = makeState({ phase, players: [makePlayer(1)], questionIndex: 0, questionStartedAt: NOW, questionEndsAt: NOW + T });
    expect(err(reduce(state, { type: 'start' }, NOW))).toBe('INVALID_PHASE');
  });

  it('does not mutate the input state', () => {
    const state = deepFreeze(makeLobbyGame(1));
    const snapshot = structuredClone(state);
    ok(reduce(state, { type: 'start' }, NOW));
    expect(state).toEqual(snapshot);
  });
});

describe('SPEC §3 Máquina de estados: QUESTION → REVEAL on timeUp (20 s)', () => {
  it('moves to REVEAL exactly at questionEndsAt', () => {
    const state = makeStartedGame(1);
    expect(ok(reduce(state, { type: 'timeUp' }, NOW + T)).phase).toBe('REVEAL');
  });

  it('moves to REVEAL after questionEndsAt', () => {
    const state = makeStartedGame(1);
    expect(ok(reduce(state, { type: 'timeUp' }, NOW + T + 5000)).phase).toBe('REVEAL');
  });

  it('keeps the question index when revealing', () => {
    const state = ok(reduce(makeStartedGame(1), { type: 'timeUp' }, NOW + T));
    expect(state.questionIndex).toBe(0);
  });

  it('is a no-op 1 ms before questionEndsAt (stale/early timer)', () => {
    const state = makeStartedGame(1);
    expect(ok(reduce(state, { type: 'timeUp' }, NOW + T - 1))).toEqual(state);
  });

  it('is a no-op at question start (t = 0)', () => {
    const state = makeStartedGame(1);
    expect(ok(reduce(state, { type: 'timeUp' }, NOW))).toEqual(state);
  });

  it('is a no-op in GENERATING', () => {
    const state = makeGeneratingGame(1);
    expect(ok(reduce(state, { type: 'timeUp' }, NOW + 10 * T))).toEqual(state);
  });

  it('is a no-op in LOBBY', () => {
    const state = makeLobbyGame(1);
    expect(ok(reduce(state, { type: 'timeUp' }, NOW + 10 * T))).toEqual(state);
  });

  it('is a no-op in REVEAL (timer firing after everyone answered)', () => {
    const state = revealGame();
    expect(ok(reduce(state, { type: 'timeUp' }, NOW + 10 * T))).toEqual(state);
  });

  it('is a no-op in LEADERBOARD', () => {
    const state = leaderboardGame();
    expect(ok(reduce(state, { type: 'timeUp' }, NOW + 10 * T))).toEqual(state);
  });

  it('is a no-op in PODIUM', () => {
    const state = makeState({ phase: 'PODIUM', players: [makePlayer(1)], questionIndex: 4, questionStartedAt: NOW, questionEndsAt: NOW + T });
    expect(ok(reduce(state, { type: 'timeUp' }, NOW + 10 * T))).toEqual(state);
  });

  it('does not mutate the input state', () => {
    const state = deepFreeze(makeStartedGame(2));
    const snapshot = structuredClone(state);
    ok(reduce(state, { type: 'timeUp' }, NOW + T));
    expect(state).toEqual(snapshot);
  });
});

describe('SPEC §3 Máquina de estados: REVEAL → LEADERBOARD → QUESTION | PODIUM on next', () => {
  it('moves REVEAL → LEADERBOARD', () => {
    const state = ok(reduce(revealGame(), { type: 'next' }, NOW + T + 1000));
    expect(state.phase).toBe('LEADERBOARD');
    expect(state.questionIndex).toBe(0);
  });

  it('moves LEADERBOARD → next QUESTION with a fresh timer and no answers', () => {
    const later = NOW + 3 * T;
    const state = ok(reduce(leaderboardGame(), { type: 'next' }, later));
    expect(state).toMatchObject({
      phase: 'QUESTION',
      questionIndex: 1,
      questionStartedAt: later,
      questionEndsAt: later + T,
      answers: {},
    });
  });

  it('clears answers from the previous question', () => {
    // Literal LEADERBOARD state with leftover answers (independent of the answer action).
    const leaderboard = makeState({
      phase: 'LEADERBOARD',
      players: [makePlayer(1), makePlayer(2)],
      questionIndex: 0,
      questionStartedAt: NOW,
      questionEndsAt: NOW + T,
      answers: { [playerId(1)]: { optionIndex: 0, elapsedMs: 10 } },
    });
    const state = ok(reduce(leaderboard, { type: 'next' }, NOW + 2 * T));
    expect(state.phase).toBe('QUESTION');
    expect(state.answers).toEqual({});
  });

  it('moves LEADERBOARD → PODIUM after the last question', () => {
    let state = leaderboardGame(1, makeQuestions(1));
    state = ok(reduce(state, { type: 'next' }, NOW + 3 * T));
    expect(state.phase).toBe('PODIUM');
  });

  it.each(['GENERATING', 'LOBBY', 'QUESTION', 'PODIUM'] as const)('rejects next in %s with INVALID_PHASE', (phase) => {
    const state = makeState({
      phase,
      players: [makePlayer(1)],
      questionIndex: phase === 'GENERATING' || phase === 'LOBBY' ? null : 0,
      questionStartedAt: NOW,
      questionEndsAt: NOW + T,
    });
    expect(err(reduce(state, { type: 'next' }, NOW + 1))).toBe('INVALID_PHASE');
  });

  it('rejects next in a real QUESTION state with INVALID_PHASE', () => {
    expect(err(reduce(makeStartedGame(1), { type: 'next' }, NOW + 1))).toBe('INVALID_PHASE');
  });

  it('does not mutate the input state', () => {
    const state = deepFreeze(leaderboardGame());
    const snapshot = structuredClone(state);
    ok(reduce(state, { type: 'next' }, NOW + 3 * T));
    expect(state).toEqual(snapshot);
  });
});

describe('SPEC §3 Máquina de estados: full run', () => {
  it('goes through 2 questions and ends in PODIUM', () => {
    const phases: string[] = [];
    let now = NOW;
    let state = createGame(newGame({ count: 2 }));
    phases.push(state.phase);
    state = ok(reduce(state, { type: 'join', playerId: playerId(1), nickname: 'Ana' }, now));
    state = ok(reduce(state, { type: 'questionsReady', questions: makeQuestions(2) }, now));
    phases.push(state.phase);
    state = ok(reduce(state, { type: 'start' }, now));
    phases.push(state.phase);
    for (let q = 0; q < 2; q++) {
      expect(state.questionIndex).toBe(q);
      now += T;
      state = ok(reduce(state, { type: 'timeUp' }, now));
      phases.push(state.phase);
      now += 1000;
      state = ok(reduce(state, { type: 'next' }, now));
      phases.push(state.phase);
      now += 1000;
      state = ok(reduce(state, { type: 'next' }, now));
      phases.push(state.phase);
    }
    expect(phases).toEqual([
      'GENERATING',
      'LOBBY',
      'QUESTION',
      'REVEAL',
      'LEADERBOARD',
      'QUESTION',
      'REVEAL',
      'LEADERBOARD',
      'PODIUM',
    ]);
    expect(err(reduce(state, { type: 'next' }, now + 1))).toBe('INVALID_PHASE');
  });
});

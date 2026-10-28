import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS, NICKNAME_MAX_LENGTH, QUESTION_TIME_MS } from '@preguntica/shared';
import { createGame, reduce } from './game.js';
import type { GameState } from './types.js';
import {
  NOW,
  deepFreeze,
  err,
  findPlayer,
  makeLobbyGame,
  makeQuestions,
  makeStartedGame,
  newGame,
  nickname,
  ok,
  playerId,
} from './test-helpers.js';

const T = QUESTION_TIME_MS;
/** Every question has the correct answer at index 0. */
const RIGHT = 0;
const WRONG = 1;
const LATE = 9;

/** Game in QUESTION 0 (started at NOW) with players 1..n; 5 questions, all correct at index 0. */
function game(players: number): GameState {
  return makeStartedGame(players, makeQuestions(5, [0, 0, 0, 0, 0]));
}

function join(state: GameState, n: number, now: number, name = nickname(n)) {
  return reduce(state, { type: 'join', playerId: playerId(n), nickname: name }, now);
}

function answer(state: GameState, player: number, optionIndex: number, now: number, questionIndex = state.questionIndex ?? -1) {
  return reduce(state, { type: 'answer', playerId: playerId(player), questionIndex, optionIndex }, now);
}

function startedAt(state: GameState): number {
  if (state.questionStartedAt === null) throw new Error('questionStartedAt not set');
  return state.questionStartedAt;
}

/** QUESTION → REVEAL via timeUp at questionEndsAt. */
function timeUp(state: GameState): GameState {
  if (state.questionEndsAt === null) throw new Error('questionEndsAt not set');
  return ok(reduce(state, { type: 'timeUp' }, state.questionEndsAt));
}

/** REVEAL → LEADERBOARD → next QUESTION, both at `now`. */
function nextQuestion(state: GameState, now: number): GameState {
  const leaderboard = ok(reduce(state, { type: 'next' }, now));
  return ok(reduce(leaderboard, { type: 'next' }, now));
}

/** Game in REVEAL of question 0 (player 1..n answered right at t = 0). */
function revealOfFirst(players: number): GameState {
  let state = game(players);
  for (let i = 1; i <= players; i++) state = ok(answer(state, i, RIGHT, NOW));
  expect(state.phase).toBe('REVEAL');
  return state;
}

describe('SPEC §3 Jugadores tardíos: joining with the game in progress', () => {
  it('accepts a new player in QUESTION with 0 points and eligibleFrom = questionIndex + 1', () => {
    const before = game(2);
    const state = ok(join(before, LATE, NOW + 500, 'Tarde'));
    expect(state.phase).toBe('QUESTION');
    expect(state.questionIndex).toBe(0);
    expect(state.answers).toEqual(before.answers);
    expect(state.players).toHaveLength(3);
    expect(findPlayer(state, playerId(LATE))).toEqual({
      id: playerId(LATE),
      nickname: 'Tarde',
      score: 0,
      streak: 0,
      connected: true,
      lastResult: null,
      eligibleFrom: 1,
    });
  });

  it('appends the late joiner at the end (join order is kept)', () => {
    const state = ok(join(game(2), LATE, NOW + 500));
    expect(state.players.map((p) => p.id)).toEqual([playerId(1), playerId(2), playerId(LATE)]);
  });

  it('accepts a new player in REVEAL of question 0 with eligibleFrom 1', () => {
    const state = ok(join(revealOfFirst(1), LATE, NOW + 10));
    expect(state.phase).toBe('REVEAL');
    expect(findPlayer(state, playerId(LATE))).toMatchObject({ score: 0, streak: 0, connected: true, lastResult: null, eligibleFrom: 1 });
  });

  it('accepts a new player in LEADERBOARD of question 0 with eligibleFrom 1', () => {
    const leaderboard = ok(reduce(revealOfFirst(1), { type: 'next' }, NOW + 10));
    const state = ok(join(leaderboard, LATE, NOW + 20));
    expect(state.phase).toBe('LEADERBOARD');
    expect(findPlayer(state, playerId(LATE))).toMatchObject({ score: 0, streak: 0, connected: true, lastResult: null, eligibleFrom: 1 });
  });

  it('uses the current questionIndex: joining in QUESTION 2 gives eligibleFrom 3', () => {
    let state = game(1);
    let now = NOW;
    for (let q = 0; q < 2; q++) {
      state = ok(answer(state, 1, RIGHT, now));
      now += T;
      state = nextQuestion(state, now);
    }
    expect(state.questionIndex).toBe(2);
    state = ok(join(state, LATE, now + 1));
    expect(findPlayer(state, playerId(LATE)).eligibleFrom).toBe(3);
  });

  it('joining in LEADERBOARD of the last question gives eligibleFrom = totalQuestions and the game still ends', () => {
    let state = makeStartedGame(1, makeQuestions(1, [0]));
    state = ok(answer(state, 1, RIGHT, NOW));
    state = ok(reduce(state, { type: 'next' }, NOW + 1));
    expect(state.phase).toBe('LEADERBOARD');
    state = ok(join(state, LATE, NOW + 2));
    expect(findPlayer(state, playerId(LATE)).eligibleFrom).toBe(1);
    state = ok(reduce(state, { type: 'next' }, NOW + 3));
    expect(state.phase).toBe('PODIUM');
    expect(findPlayer(state, playerId(LATE))).toMatchObject({ score: 0, lastResult: null });
  });

  it('rejects a new player in PODIUM with INVALID_PHASE', () => {
    let state = makeStartedGame(1, makeQuestions(1, [0]));
    state = ok(answer(state, 1, RIGHT, NOW));
    state = ok(reduce(state, { type: 'next' }, NOW + 1));
    state = ok(reduce(state, { type: 'next' }, NOW + 2));
    expect(state.phase).toBe('PODIUM');
    expect(err(join(state, LATE, NOW + 3))).toBe('INVALID_PHASE');
  });
});

describe('SPEC §3 Jugadores tardíos: players who join before the start take part from question 0', () => {
  it('joining in GENERATING gives eligibleFrom 0', () => {
    const state = ok(join(createGame(newGame()), 1, NOW));
    expect(findPlayer(state, playerId(1)).eligibleFrom).toBe(0);
  });

  it('joining in LOBBY gives eligibleFrom 0', () => {
    const state = ok(join(makeLobbyGame(0), 1, NOW));
    expect(findPlayer(state, playerId(1)).eligibleFrom).toBe(0);
  });

  it('players of a started game all have eligibleFrom 0', () => {
    expect(game(3).players.map((p) => p.eligibleFrom)).toEqual([0, 0, 0]);
  });
});

describe('SPEC §3 Límites: nickname and room size rules also apply mid-game', () => {
  it.each(['', '   '])('rejects nickname %j in QUESTION with INVALID_PAYLOAD', (name) => {
    expect(err(join(game(2), LATE, NOW + 1, name))).toBe('INVALID_PAYLOAD');
  });

  it(`rejects ${NICKNAME_MAX_LENGTH + 1} characters in QUESTION with INVALID_PAYLOAD`, () => {
    expect(err(join(game(2), LATE, NOW + 1, 'x'.repeat(NICKNAME_MAX_LENGTH + 1)))).toBe('INVALID_PAYLOAD');
  });

  it('trims the nickname of a late joiner', () => {
    const state = ok(join(game(2), LATE, NOW + 1, '  Tarde  '));
    expect(findPlayer(state, playerId(LATE)).nickname).toBe('Tarde');
  });

  it('rejects a duplicate nickname (case-insensitive) in QUESTION with NICKNAME_TAKEN', () => {
    expect(err(join(game(2), LATE, NOW + 1, ` ${nickname(1).toUpperCase()} `))).toBe('NICKNAME_TAKEN');
  });

  it('rejects a duplicate nickname in REVEAL with NICKNAME_TAKEN', () => {
    expect(err(join(revealOfFirst(2), LATE, NOW + 1, nickname(2)))).toBe('NICKNAME_TAKEN');
  });

  it(`accepts the ${MAX_PLAYERS}th player mid-game`, () => {
    const state = ok(join(game(MAX_PLAYERS - 1), MAX_PLAYERS, NOW + 1));
    expect(state.players).toHaveLength(MAX_PLAYERS);
  });

  it(`rejects player ${MAX_PLAYERS + 1} mid-game with ROOM_FULL`, () => {
    expect(err(join(game(MAX_PLAYERS), MAX_PLAYERS + 1, NOW + 1, 'Late'))).toBe('ROOM_FULL');
  });
});

describe('SPEC §3 Jugadores tardíos: the question in progress is not for the late joiner', () => {
  it('rejects its answer to the current question with INVALID_PHASE without touching the state', () => {
    const state = deepFreeze(ok(join(game(2), LATE, NOW + 100)));
    expect(err(answer(state, LATE, RIGHT, NOW + 200))).toBe('INVALID_PHASE');
    expect(state.answers).toEqual({});
  });

  it('does not block REVEAL: the phase changes once every eligible connected player answered', () => {
    let state = ok(join(game(2), LATE, NOW + 100));
    state = ok(answer(state, 1, RIGHT, NOW + 200));
    expect(state.phase).toBe('QUESTION');
    state = ok(answer(state, 2, WRONG, NOW + 300));
    expect(state.phase).toBe('REVEAL');
  });

  it('does not block REVEAL with a single eligible player', () => {
    let state = ok(join(game(1), LATE, NOW + 100));
    state = ok(answer(state, 1, RIGHT, NOW + 200));
    expect(state.phase).toBe('REVEAL');
  });

  it('does not block REVEAL when the last pending eligible player disconnects', () => {
    let state = ok(join(game(2), LATE, NOW + 100));
    state = ok(answer(state, 1, RIGHT, NOW + 200));
    state = ok(reduce(state, { type: 'disconnect', playerId: playerId(2) }, NOW + 300));
    expect(state.phase).toBe('REVEAL');
  });

  it('leaves the late joiner untouched on REVEAL reached by answers, and scores eligible players', () => {
    let state = ok(join(game(2), LATE, NOW + 100));
    state = ok(answer(state, 1, RIGHT, NOW));
    state = ok(answer(state, 2, WRONG, NOW + 300));
    expect(findPlayer(state, playerId(LATE))).toMatchObject({ score: 0, streak: 0, lastResult: null, eligibleFrom: 1 });
    expect(findPlayer(state, playerId(1)).lastResult).toEqual({ correct: true, points: 1000, streak: 1, totalScore: 1000 });
    expect(findPlayer(state, playerId(2)).lastResult).toEqual({ correct: false, points: 0, streak: 0, totalScore: 0 });
  });

  it('leaves the late joiner untouched on REVEAL reached by timeUp', () => {
    let state = ok(join(game(2), LATE, NOW + 100));
    state = ok(answer(state, 1, RIGHT, NOW));
    state = timeUp(state);
    expect(state.phase).toBe('REVEAL');
    expect(findPlayer(state, playerId(LATE))).toMatchObject({ score: 0, streak: 0, lastResult: null });
    expect(findPlayer(state, playerId(2)).lastResult).toEqual({ correct: false, points: 0, streak: 0, totalScore: 0 });
  });
});

describe('SPEC §3 Jugadores tardíos: the late joiner plays from the next question', () => {
  it('can answer the next question and is scored normally (correct at t = 0 → 1000)', () => {
    let state = ok(join(game(1), LATE, NOW + 100));
    state = ok(answer(state, 1, RIGHT, NOW + 200));
    const t1 = NOW + 2 * T;
    state = nextQuestion(state, t1);
    expect(state.questionIndex).toBe(1);
    expect(startedAt(state)).toBe(t1);

    state = ok(answer(state, LATE, RIGHT, t1));
    expect(state.answers[playerId(LATE)]).toEqual({ optionIndex: RIGHT, elapsedMs: 0 });
    state = ok(answer(state, 1, WRONG, t1 + 10));
    expect(state.phase).toBe('REVEAL');
    expect(findPlayer(state, playerId(LATE))).toMatchObject({
      score: 1000,
      streak: 1,
      lastResult: { correct: true, points: 1000, streak: 1, totalScore: 1000 },
    });
  });

  it('counts for "everyone answered" from the next question', () => {
    let state = ok(join(game(2), LATE, NOW + 100));
    state = ok(answer(state, 1, RIGHT, NOW + 200));
    state = ok(answer(state, 2, RIGHT, NOW + 300));
    const t1 = NOW + 2 * T;
    state = nextQuestion(state, t1);
    state = ok(answer(state, 1, RIGHT, t1 + 1));
    state = ok(answer(state, 2, RIGHT, t1 + 2));
    expect(state.phase).toBe('QUESTION');
    state = ok(answer(state, LATE, RIGHT, t1 + 3));
    expect(state.phase).toBe('REVEAL');
  });

  it('gets 0 and lastResult {correct:false} if it does not answer the next question (timeUp)', () => {
    let state = ok(join(game(1), LATE, NOW + 100));
    state = ok(answer(state, 1, RIGHT, NOW + 200));
    state = nextQuestion(state, NOW + 2 * T);
    state = ok(answer(state, 1, RIGHT, NOW + 2 * T));
    expect(state.phase).toBe('QUESTION');
    state = timeUp(state);
    expect(findPlayer(state, playerId(LATE))).toMatchObject({
      score: 0,
      streak: 0,
      lastResult: { correct: false, points: 0, streak: 0, totalScore: 0 },
    });
  });

  it('a player joining in REVEAL of question 0 takes part in question 1 (can answer and is waited for)', () => {
    let state = ok(join(revealOfFirst(1), LATE, NOW + 10));
    const t1 = NOW + 2 * T;
    state = nextQuestion(state, t1);
    state = ok(answer(state, 1, RIGHT, t1));
    expect(state.phase).toBe('QUESTION');
    state = ok(answer(state, LATE, RIGHT, t1 + T / 2));
    expect(state.phase).toBe('REVEAL');
    expect(findPlayer(state, playerId(LATE)).lastResult).toEqual({ correct: true, points: 750, streak: 1, totalScore: 750 });
  });

  it('a player joining in LEADERBOARD of question 0 takes part in question 1', () => {
    let state = ok(reduce(revealOfFirst(1), { type: 'next' }, NOW + 10));
    state = ok(join(state, LATE, NOW + 20));
    const t1 = NOW + 2 * T;
    state = ok(reduce(state, { type: 'next' }, t1));
    expect(state.questionIndex).toBe(1);
    state = ok(answer(state, 1, RIGHT, t1));
    expect(state.phase).toBe('QUESTION');
    state = ok(answer(state, LATE, RIGHT, t1));
    expect(state.phase).toBe('REVEAL');
    expect(findPlayer(state, playerId(LATE)).score).toBe(1000);
  });
});

describe('SPEC §3 reconnection: never changes eligibleFrom', () => {
  it('a late joiner that reconnects during the same question keeps eligibleFrom and still cannot answer it', () => {
    let state = ok(join(game(2), LATE, NOW + 100));
    state = ok(reduce(state, { type: 'disconnect', playerId: playerId(LATE) }, NOW + 200));
    state = ok(join(state, LATE, NOW + 300, 'OtherName'));
    expect(findPlayer(state, playerId(LATE))).toMatchObject({ connected: true, nickname: nickname(LATE), eligibleFrom: 1 });
    expect(err(answer(state, LATE, RIGHT, NOW + 400))).toBe('INVALID_PHASE');
  });

  it('a late joiner that reconnects in a later question keeps eligibleFrom', () => {
    let state = ok(join(game(1), LATE, NOW + 100));
    state = ok(reduce(state, { type: 'disconnect', playerId: playerId(LATE) }, NOW + 150));
    state = ok(answer(state, 1, RIGHT, NOW + 200));
    let now = NOW + 2 * T;
    state = nextQuestion(state, now);
    state = ok(answer(state, 1, RIGHT, now));
    now += 2 * T;
    state = nextQuestion(state, now);
    expect(state.questionIndex).toBe(2);
    state = ok(join(state, LATE, now + 1));
    expect(findPlayer(state, playerId(LATE)).eligibleFrom).toBe(1);
  });

  it('an original player reconnecting mid-game keeps eligibleFrom 0', () => {
    let state = ok(reduce(game(2), { type: 'disconnect', playerId: playerId(2) }, NOW + 1));
    state = ok(join(state, 2, NOW + 2));
    expect(findPlayer(state, playerId(2))).toMatchObject({ connected: true, eligibleFrom: 0 });
  });
});

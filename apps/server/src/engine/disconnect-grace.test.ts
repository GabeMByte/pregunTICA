import { describe, expect, it } from 'vitest';
import { DISCONNECT_GRACE_MS, QUESTION_TIME_MS } from '@preguntica/shared';
import { reduce } from './game.js';
import type { GameState } from './types.js';
import { NOW, findPlayer, makeQuestions, makeStartedGame, nickname, ok, playerId } from './test-helpers.js';

/**
 * SPEC §3 Desconexiones: a reload, switching apps or a locked phone drops the socket for a moment.
 * That alone must never end the question, and a player gone for less than DISCONNECT_GRACE_MS
 * still counts as pending when someone else's answer would reveal.
 */
const T = QUESTION_TIME_MS;
const GRACE = DISCONNECT_GRACE_MS;
const RIGHT = 0;

function game(players: number): GameState {
  return makeStartedGame(players, makeQuestions(5, [0, 0, 0, 0, 0]));
}

function answer(state: GameState, player: number, now: number, optionIndex = RIGHT): GameState {
  return ok(reduce(state, { type: 'answer', playerId: playerId(player), questionIndex: state.questionIndex ?? -1, optionIndex }, now));
}

function disconnect(state: GameState, player: number, now: number): GameState {
  return ok(reduce(state, { type: 'disconnect', playerId: playerId(player) }, now));
}

function rejoin(state: GameState, player: number, now: number): GameState {
  return ok(reduce(state, { type: 'join', playerId: playerId(player), nickname: nickname(player) }, now));
}

describe('SPEC §3 Desconexiones: a disconnect alone never reveals', () => {
  it('the only player reloading mid-question keeps the question open', () => {
    const state = disconnect(game(1), 1, NOW + 1_000);
    expect(state.phase).toBe('QUESTION');
    expect(findPlayer(state, playerId(1)).lastResult).toBeNull();
  });

  it('the last pending player disconnecting keeps the question open', () => {
    let state = answer(game(3), 1, NOW + 1_000);
    state = answer(state, 2, NOW + 2_000);
    state = disconnect(state, 3, NOW + 3_000);
    expect(state.phase).toBe('QUESTION');
  });

  it('records when the player left, with the injected time, and clears it on return', () => {
    let state = disconnect(game(2), 2, NOW + 1_234);
    expect(findPlayer(state, playerId(2))).toMatchObject({ connected: false, disconnectedAt: NOW + 1_234 });
    state = rejoin(state, 2, NOW + 2_000);
    expect(findPlayer(state, playerId(2))).toMatchObject({ connected: true, disconnectedAt: null });
  });
});

describe('SPEC §3 Desconexiones: 1 player reloads and then answers in time', () => {
  it('the answer after coming back reveals and scores it normally', () => {
    let state = disconnect(game(1), 1, NOW + 1_000);
    state = rejoin(state, 1, NOW + 1_500);
    expect(state.phase).toBe('QUESTION');
    state = answer(state, 1, NOW + 2_000);
    expect(state.phase).toBe('REVEAL');
    // Answered at 2000 ms of 20000: 1000 - 2000/20000 * 500 = 950.
    expect(findPlayer(state, playerId(1)).lastResult).toEqual({ correct: true, points: 950, streak: 1, totalScore: 950 });
  });
});

describe('SPEC §3 Desconexiones: 3 players, the last pending one drops for 2 s and comes back', () => {
  it('waits for it, then reveals when it answers', () => {
    let state = answer(game(3), 1, NOW + 1_000);
    state = disconnect(state, 3, NOW + 2_000);
    state = answer(state, 2, NOW + 3_000);
    expect(state.phase).toBe('QUESTION');
    state = rejoin(state, 3, NOW + 4_000);
    expect(state.phase).toBe('QUESTION');
    state = answer(state, 3, NOW + 5_000);
    expect(state.phase).toBe('REVEAL');
    expect(findPlayer(state, playerId(3)).lastResult?.correct).toBe(true);
  });

  it('a player that came back is pending like any other, however long ago it dropped', () => {
    let state = disconnect(game(2), 2, NOW + 1_000);
    state = rejoin(state, 2, NOW + 1_500);
    state = answer(state, 1, NOW + 1_000 + GRACE + 1);
    expect(state.phase).toBe('QUESTION');
  });
});

describe('SPEC §3 Desconexiones: the grace window', () => {
  it('within DISCONNECT_GRACE_MS the disconnected player still counts as pending', () => {
    let state = disconnect(game(2), 2, NOW + 1_000);
    state = answer(state, 1, NOW + 1_000 + GRACE - 1);
    expect(state.phase).toBe('QUESTION');
  });

  it('once the grace is over, the next answer reveals without waiting for it', () => {
    let state = disconnect(game(2), 2, NOW + 1_000);
    state = answer(state, 1, NOW + 1_000 + GRACE);
    expect(state.phase).toBe('REVEAL');
    expect(findPlayer(state, playerId(2)).lastResult).toEqual({ correct: false, points: 0, streak: 0, totalScore: 0 });
  });

  it('counts from the disconnect even if it happened before the question started', () => {
    let state = answer(game(2), 1, NOW + 1_000);
    state = answer(state, 2, NOW + 1_000);
    expect(state.phase).toBe('REVEAL');
    // Player 2 drops on the leaderboard, right before the next question.
    state = ok(reduce(state, { type: 'next' }, NOW + 2_000));
    state = disconnect(state, 2, NOW + 2_500);
    state = ok(reduce(state, { type: 'next' }, NOW + 3_000));
    expect(state.phase).toBe('QUESTION');
    expect(answer(state, 1, NOW + 4_000).phase).toBe('QUESTION');
    expect(answer(state, 1, NOW + 2_500 + GRACE).phase).toBe('REVEAL');
  });
});

describe('SPEC §3 Desconexiones: a player that never comes back does not block past the timer', () => {
  it('the 20 s timer closes the question and scores it 0', () => {
    let state = disconnect(game(2), 2, NOW + 1_000);
    state = answer(state, 1, NOW + 2_000);
    expect(state.phase).toBe('QUESTION');
    state = ok(reduce(state, { type: 'timeUp' }, NOW + T));
    expect(state.phase).toBe('REVEAL');
    expect(findPlayer(state, playerId(2)).lastResult).toEqual({ correct: false, points: 0, streak: 0, totalScore: 0 });
  });

  it('with nobody else in the room the timer still closes it', () => {
    const state = ok(reduce(disconnect(game(1), 1, NOW + 1_000), { type: 'timeUp' }, NOW + T));
    expect(state.phase).toBe('REVEAL');
  });
});

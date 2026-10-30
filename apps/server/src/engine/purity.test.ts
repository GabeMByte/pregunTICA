import { describe, expect, it } from 'vitest';
import { QUESTION_TIME_MS } from '@preguntica/shared';
import { createGame, reduce } from './game.js';
import type { GameAction, GameState } from './types.js';
import { NOW, deepFreeze, makeLobbyGame, makeQuestions, makeStartedGame, newGame, ok, playerId } from './test-helpers.js';

const T = QUESTION_TIME_MS;

function leaderboard(): GameState {
  const reveal = ok(reduce(makeStartedGame(1), { type: 'timeUp' }, NOW + T));
  return ok(reduce(reveal, { type: 'next' }, NOW + T + 1));
}

function disconnectedMidGame(): GameState {
  return ok(reduce(leaderboard(), { type: 'disconnect', playerId: playerId(1) }, NOW + T + 2));
}

describe('Engine purity (CLAUDE.md rule #1): reduce never mutates its input', () => {
  it.each<{ name: string; build: () => GameState; action: GameAction; now: number }>([
    { name: 'questionsReady', build: () => createGame(newGame()), action: { type: 'questionsReady', origin: 'ai', questions: makeQuestions(5) }, now: NOW },
    { name: 'join (new player)', build: () => makeLobbyGame(1), action: { type: 'join', playerId: playerId(2), nickname: 'Beto' }, now: NOW },
    { name: 'join (reconnection)', build: disconnectedMidGame, action: { type: 'join', playerId: playerId(1), nickname: 'Ana' }, now: NOW },
    { name: 'disconnect', build: () => makeStartedGame(2), action: { type: 'disconnect', playerId: playerId(1) }, now: NOW },
    { name: 'disconnect (removed in LOBBY)', build: () => makeLobbyGame(2), action: { type: 'disconnect', playerId: playerId(1) }, now: NOW },
    { name: 'start', build: () => makeLobbyGame(1), action: { type: 'start' }, now: NOW },
    { name: 'answer', build: () => makeStartedGame(2), action: { type: 'answer', playerId: playerId(1), questionIndex: 0, optionIndex: 0 }, now: NOW + 10 },
    { name: 'answer (triggers REVEAL scoring)', build: () => makeStartedGame(1), action: { type: 'answer', playerId: playerId(1), questionIndex: 0, optionIndex: 0 }, now: NOW + 10 },
    { name: 'timeUp', build: () => makeStartedGame(2), action: { type: 'timeUp' }, now: NOW + T },
    { name: 'next', build: leaderboard, action: { type: 'next' }, now: NOW + 3 * T },
  ])('$name returns a new state and leaves the frozen input intact', ({ build, action, now }) => {
    // Any write to a deeply frozen object throws in strict mode (ES modules).
    const state = deepFreeze(build());
    expect(ok(reduce(state, action, now))).not.toBe(state);
  });
});

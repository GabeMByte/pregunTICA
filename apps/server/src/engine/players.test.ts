import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS, NICKNAME_MAX_LENGTH, QUESTION_TIME_MS } from '@preguntica/shared';
import { createGame, reduce } from './game.js';
import type { GameState } from './types.js';
import {
  NOW,
  ROOM_CODE,
  at,
  err,
  findPlayer,
  makeGeneratingGame,
  makeLobbyGame,
  makePlayer,
  makeState,
  newGame,
  nickname,
  ok,
  playerId,
} from './test-helpers.js';

function join(state: GameState, id: string, name: string, now = NOW) {
  return reduce(state, { type: 'join', playerId: id, nickname: name }, now);
}

/**
 * Literal state in a mid-game phase (built without the reducer, so this file only
 * depends on join/disconnect). Player 1 has score 1850 and streak 2.
 */
function midGame(phase: 'QUESTION' | 'REVEAL' | 'LEADERBOARD' | 'PODIUM', players = 2): GameState {
  return makeState({
    phase,
    players: Array.from({ length: players }, (_, i) =>
      i === 0
        ? makePlayer(1, { score: 1850, streak: 2, lastResult: { correct: true, points: 1100, streak: 2, totalScore: 1850 } })
        : makePlayer(i + 1),
    ),
    questionIndex: phase === 'PODIUM' ? 4 : 1,
    questionStartedAt: NOW,
    questionEndsAt: NOW + QUESTION_TIME_MS,
  });
}

describe('SPEC §3 Máquina de estados: createGame starts in GENERATING', () => {
  it('creates an empty game with the requested config', () => {
    const state = createGame({ code: ROOM_CODE, topic: 'Volcanes', difficulty: 'hard', count: 7 });
    expect(state).toMatchObject({
      code: ROOM_CODE,
      topic: 'Volcanes',
      difficulty: 'hard',
      phase: 'GENERATING',
      players: [],
      questions: [],
      questionIndex: null,
      totalQuestions: 7,
      answers: {},
    });
  });
});

describe('SPEC §3 GENERATING/LOBBY: players can join while questions generate', () => {
  it('allows joining in GENERATING', () => {
    const state = ok(join(createGame(newGame()), playerId(1), 'Ana'));
    expect(state.phase).toBe('GENERATING');
    expect(state.players).toEqual([
      { id: playerId(1), nickname: 'Ana', score: 0, streak: 0, connected: true, lastResult: null },
    ]);
  });

  it('allows joining in LOBBY', () => {
    const state = ok(join(makeLobbyGame(0), playerId(1), 'Ana'));
    expect(state.phase).toBe('LOBBY');
    expect(state.players).toHaveLength(1);
    expect(at(state.players, 0)).toMatchObject({ nickname: 'Ana', score: 0, streak: 0, connected: true, lastResult: null });
  });

  it('trims the nickname', () => {
    const state = ok(join(createGame(newGame()), playerId(1), '   Ana  '));
    expect(at(state.players, 0).nickname).toBe('Ana');
  });

  it('keeps players in join order', () => {
    let state = createGame(newGame());
    state = ok(join(state, playerId(3), 'Carla'));
    state = ok(join(state, playerId(1), 'Ana'));
    state = ok(join(state, playerId(2), 'Beto'));
    expect(state.players.map((p) => p.nickname)).toEqual(['Carla', 'Ana', 'Beto']);
  });
});

describe('SPEC §3 Límites: nickname of 1–16 characters', () => {
  it.each(['', '   ', '\t \n'])('rejects empty or whitespace nickname %j with INVALID_PAYLOAD', (name) => {
    expect(err(join(createGame(newGame()), playerId(1), name))).toBe('INVALID_PAYLOAD');
  });

  it('accepts a 1-character nickname', () => {
    expect(at(ok(join(createGame(newGame()), playerId(1), 'A')).players, 0).nickname).toBe('A');
  });

  it(`accepts exactly ${NICKNAME_MAX_LENGTH} characters`, () => {
    const name = 'x'.repeat(NICKNAME_MAX_LENGTH);
    expect(at(ok(join(createGame(newGame()), playerId(1), name)).players, 0).nickname).toBe(name);
  });

  it(`rejects ${NICKNAME_MAX_LENGTH + 1} characters with INVALID_PAYLOAD`, () => {
    expect(err(join(createGame(newGame()), playerId(1), 'x'.repeat(NICKNAME_MAX_LENGTH + 1)))).toBe('INVALID_PAYLOAD');
  });

  it('measures length after trimming', () => {
    const name = `  ${'x'.repeat(NICKNAME_MAX_LENGTH)}  `;
    expect(at(ok(join(createGame(newGame()), playerId(1), name)).players, 0).nickname).toBe('x'.repeat(NICKNAME_MAX_LENGTH));
  });
});

describe('SPEC §3 Límites: nickname unique in the room', () => {
  it('rejects an exact duplicate with NICKNAME_TAKEN', () => {
    const state = ok(join(createGame(newGame()), playerId(1), 'Ana'));
    expect(err(join(state, playerId(2), 'Ana'))).toBe('NICKNAME_TAKEN');
  });

  it('compares case-insensitively after trimming', () => {
    const state = ok(join(createGame(newGame()), playerId(1), 'Ana'));
    expect(err(join(state, playerId(2), '  aNA '))).toBe('NICKNAME_TAKEN');
  });

  it('also counts disconnected players', () => {
    let state = ok(join(makeLobbyGame(0), playerId(1), 'Ana'));
    state = ok(reduce(state, { type: 'disconnect', playerId: playerId(1) }, NOW));
    expect(err(join(state, playerId(2), 'ANA'))).toBe('NICKNAME_TAKEN');
  });
});

describe(`SPEC §3 Límites: max ${MAX_PLAYERS} players per room`, () => {
  it(`accepts the ${MAX_PLAYERS}th player`, () => {
    const state = makeGeneratingGame(MAX_PLAYERS - 1);
    expect(ok(join(state, playerId(MAX_PLAYERS), nickname(MAX_PLAYERS))).players).toHaveLength(MAX_PLAYERS);
  });

  it(`rejects player ${MAX_PLAYERS + 1} with ROOM_FULL`, () => {
    const state = makeLobbyGame(MAX_PLAYERS);
    expect(err(join(state, playerId(MAX_PLAYERS + 1), 'Late'))).toBe('ROOM_FULL');
  });

  it('disconnected players still hold their slot', () => {
    let state = makeLobbyGame(MAX_PLAYERS);
    state = ok(reduce(state, { type: 'disconnect', playerId: playerId(1) }, NOW));
    expect(err(join(state, playerId(MAX_PLAYERS + 1), 'Late'))).toBe('ROOM_FULL');
  });
});

describe('SPEC §3 Máquina de estados: no new players once the game started', () => {
  it.each(['QUESTION', 'REVEAL', 'LEADERBOARD', 'PODIUM'] as const)('rejects a new player in %s with INVALID_PHASE', (phase) => {
    const state = midGame(phase);
    expect(state.phase).toBe(phase);
    expect(err(join(state, playerId(99), 'Late'))).toBe('INVALID_PHASE');
  });
});

describe('SPEC §3 reconnection: join with an existing playerId', () => {
  it('reconnects in LOBBY without duplicating and keeps the original nickname', () => {
    let state = makeLobbyGame(2);
    state = ok(reduce(state, { type: 'disconnect', playerId: playerId(1) }, NOW));
    state = ok(join(state, playerId(1), 'OtherName'));
    expect(state.players).toHaveLength(2);
    expect(findPlayer(state, playerId(1))).toMatchObject({ connected: true, nickname: nickname(1) });
  });

  it.each(['QUESTION', 'REVEAL', 'LEADERBOARD', 'PODIUM'] as const)('is allowed in %s and keeps score and streak', (phase) => {
    const base = midGame(phase);
    const state = ok(join({ ...base, players: base.players.map((p) => (p.id === playerId(1) ? { ...p, connected: false } : p)) }, playerId(1), 'OtherName', NOW + 1000));
    expect(state.phase).toBe(phase);
    expect(state.players).toHaveLength(2);
    expect(findPlayer(state, playerId(1))).toMatchObject({ connected: true, nickname: nickname(1), score: 1850, streak: 2 });
  });

  it('is allowed even when the room is full', () => {
    let state = makeLobbyGame(MAX_PLAYERS);
    state = ok(reduce(state, { type: 'disconnect', playerId: playerId(7) }, NOW));
    state = ok(join(state, playerId(7), nickname(7)));
    expect(state.players).toHaveLength(MAX_PLAYERS);
    expect(findPlayer(state, playerId(7)).connected).toBe(true);
  });

  it('is idempotent for an already connected player', () => {
    let state = makeLobbyGame(1);
    state = ok(join(state, playerId(1), nickname(1)));
    expect(state.players).toHaveLength(1);
    expect(at(state.players, 0).connected).toBe(true);
  });
});

describe('SPEC §3 disconnect: player is kept but marked disconnected', () => {
  it('sets connected = false and keeps the player data', () => {
    let state = makeLobbyGame(2);
    state = ok(reduce(state, { type: 'disconnect', playerId: playerId(2) }, NOW));
    expect(state.players).toHaveLength(2);
    expect(findPlayer(state, playerId(2))).toMatchObject({ nickname: nickname(2), connected: false, score: 0 });
    expect(findPlayer(state, playerId(1)).connected).toBe(true);
  });

  it('rejects an unknown id with PLAYER_NOT_FOUND', () => {
    expect(err(reduce(makeLobbyGame(1), { type: 'disconnect', playerId: playerId(42) }, NOW))).toBe('PLAYER_NOT_FOUND');
  });
});

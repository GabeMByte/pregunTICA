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
      { id: playerId(1), nickname: 'Ana', score: 0, streak: 0, connected: true, lastResult: null, eligibleFrom: 0 },
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

  it('also counts disconnected players once the game started', () => {
    const state = ok(reduce(midGame('LEADERBOARD'), { type: 'disconnect', playerId: playerId(1) }, NOW));
    expect(err(join(state, playerId(9), nickname(1).toUpperCase()))).toBe('NICKNAME_TAKEN');
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

  it('disconnected players still hold their slot once the game started', () => {
    const state = ok(reduce(midGame('LEADERBOARD', MAX_PLAYERS), { type: 'disconnect', playerId: playerId(1) }, NOW));
    expect(err(join(state, playerId(MAX_PLAYERS + 1), 'Late'))).toBe('ROOM_FULL');
  });
});

describe('SPEC §3 Jugadores tardíos: no new players once the game is over', () => {
  it('rejects a new player in PODIUM with INVALID_PHASE', () => {
    const state = midGame('PODIUM');
    expect(state.phase).toBe('PODIUM');
    expect(err(join(state, playerId(99), 'Late'))).toBe('INVALID_PHASE');
  });

  it.each(['QUESTION', 'REVEAL', 'LEADERBOARD'] as const)('accepts a new player in %s (details in late-join.test.ts)', (phase) => {
    const state = ok(join(midGame(phase), playerId(99), 'Late'));
    expect(state.phase).toBe(phase);
    expect(state.players).toHaveLength(3);
  });
});

describe('SPEC §3 reconnection: join with an existing playerId', () => {
  it('in LOBBY a player removed on disconnect comes back as a new player with the new nickname', () => {
    let state = makeLobbyGame(2);
    state = ok(reduce(state, { type: 'disconnect', playerId: playerId(1) }, NOW));
    state = ok(join(state, playerId(1), 'OtherName'));
    expect(state.players).toHaveLength(2);
    expect(findPlayer(state, playerId(1))).toMatchObject({ connected: true, nickname: 'OtherName', score: 0 });
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

  it('returns the very same state for an already connected player (a no-op, so nothing is broadcast)', () => {
    const state = makeLobbyGame(2);
    expect(ok(join(state, playerId(1), 'OtherName'))).toBe(state);
  });
});

describe('SPEC §3 disconnect: once the game started the player is kept but marked disconnected', () => {
  it.each(['QUESTION', 'REVEAL', 'LEADERBOARD', 'PODIUM'] as const)('in %s sets connected = false and keeps score and nickname', (phase) => {
    const state = ok(reduce(midGame(phase), { type: 'disconnect', playerId: playerId(1) }, NOW));
    expect(state.players).toHaveLength(2);
    expect(findPlayer(state, playerId(1))).toMatchObject({ nickname: nickname(1), connected: false, score: 1850 });
    expect(findPlayer(state, playerId(2)).connected).toBe(true);
  });

  it('rejects an unknown id with PLAYER_NOT_FOUND', () => {
    expect(err(reduce(makeLobbyGame(1), { type: 'disconnect', playerId: playerId(42) }, NOW))).toBe('PLAYER_NOT_FOUND');
  });
});

describe('security review A1: before the game starts a disconnected player is removed', () => {
  it.each([
    ['GENERATING', makeGeneratingGame],
    ['LOBBY', makeLobbyGame],
  ] as const)('in %s the player leaves the room', (_phase, build) => {
    const state = ok(reduce(build(2), { type: 'disconnect', playerId: playerId(2) }, NOW));
    expect(state.players.map((p) => p.id)).toEqual([playerId(1)]);
  });

  it('frees the slot of a full room', () => {
    const state = ok(reduce(makeLobbyGame(MAX_PLAYERS), { type: 'disconnect', playerId: playerId(1) }, NOW));
    expect(ok(join(state, playerId(MAX_PLAYERS + 1), 'Late')).players).toHaveLength(MAX_PLAYERS);
  });

  it('frees the nickname', () => {
    const state = ok(reduce(makeLobbyGame(2), { type: 'disconnect', playerId: playerId(1) }, NOW));
    expect(findPlayer(ok(join(state, playerId(9), nickname(1))), playerId(9)).nickname).toBe(nickname(1));
  });

  it('a second disconnect of the removed player is PLAYER_NOT_FOUND', () => {
    const state = ok(reduce(makeLobbyGame(2), { type: 'disconnect', playerId: playerId(1) }, NOW));
    expect(err(reduce(state, { type: 'disconnect', playerId: playerId(1) }, NOW))).toBe('PLAYER_NOT_FOUND');
  });
});

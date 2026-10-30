import { describe, expect, it } from 'vitest';
import { QUESTION_TIME_MS } from '@preguntica/shared';
import { createGame, reduce } from './game.js';
import { scoreAnswer } from './scoring.js';
import type { GameState, Player } from './types.js';
import {
  NOW,
  at,
  deepFreeze,
  err,
  findPlayer,
  makePlayer,
  makeQuestions,
  makeState,
  newGame,
  nickname,
  ok,
  playerId,
} from './test-helpers.js';

const T = QUESTION_TIME_MS;
/** Every question has the correct answer at index 0. */
const QUESTIONS = makeQuestions(5, [0, 0, 0, 0, 0]);
const RIGHT = 0;
const WRONG = 1;

function kick(state: GameState, name: string, now = NOW) {
  return reduce(state, { type: 'kick', nickname: name }, now);
}

function join(state: GameState, id: string, name: string, now = NOW) {
  return reduce(state, { type: 'join', playerId: id, nickname: name }, now);
}

/** Players 1..n with default fixtures; player 1 has score 1850 and streak 2. */
function players(n: number): Player[] {
  return Array.from({ length: n }, (_, i) =>
    i === 0
      ? makePlayer(1, { score: 1850, streak: 2, lastResult: { correct: true, points: 1100, streak: 2, totalScore: 1850 } })
      : makePlayer(i + 1),
  );
}

type KickablePhase = 'GENERATING' | 'LOBBY' | 'QUESTION' | 'REVEAL' | 'LEADERBOARD';

/** Literal state in `phase` (no reducer involved). Mid-game phases are on question index 1. */
function stateIn(phase: KickablePhase | 'PODIUM', n = 3, overrides: Partial<GameState> = {}): GameState {
  const preGame = phase === 'GENERATING' || phase === 'LOBBY';
  return makeState({
    phase,
    questions: phase === 'GENERATING' ? [] : QUESTIONS,
    totalQuestions: 5,
    players: players(n),
    questionIndex: preGame ? null : phase === 'PODIUM' ? 4 : 1,
    questionStartedAt: preGame ? null : NOW,
    questionEndsAt: preGame ? null : NOW + T,
    ...overrides,
  });
}

const KICKABLE: readonly KickablePhase[] = ['GENERATING', 'LOBBY', 'QUESTION', 'REVEAL', 'LEADERBOARD'];

describe('SPEC §3 Límites (host:kick): createGame starts with no kicked ids', () => {
  it('createGame returns kickedIds: []', () => {
    expect(createGame(newGame()).kickedIds).toEqual([]);
  });
});

describe('SPEC §3 Límites (host:kick): removes the player in any phase but PODIUM', () => {
  it.each(KICKABLE)('in %s removes the player, keeps the others in order and unchanged, and records its id', (phase) => {
    // In QUESTION, player 3 has not answered, so the phase does not change.
    const before = stateIn(phase, 3);
    const after = ok(kick(before, nickname(2)));
    expect(after.players).toEqual([at(before.players, 0), at(before.players, 2)]);
    expect(after.kickedIds).toEqual([playerId(2)]);
    expect(after.phase).toBe(phase);
  });

  it('kicks the first and the last player of the list', () => {
    const before = stateIn('LOBBY', 3);
    const withoutFirst = ok(kick(before, nickname(1)));
    expect(withoutFirst.players.map((p) => p.id)).toEqual([playerId(2), playerId(3)]);
    const withoutLast = ok(kick(withoutFirst, nickname(3)));
    expect(withoutLast.players.map((p) => p.id)).toEqual([playerId(2)]);
    expect(withoutLast.kickedIds).toEqual([playerId(1), playerId(3)]);
  });

  it('kicking the only player in LOBBY leaves an empty room', () => {
    const after = ok(kick(stateIn('LOBBY', 1), nickname(1)));
    expect(after.players).toEqual([]);
    expect(after.phase).toBe('LOBBY');
  });

  it('appends to the end of an existing kickedIds list', () => {
    const before = stateIn('LOBBY', 3, { kickedIds: [playerId(9)] });
    expect(ok(kick(before, nickname(2))).kickedIds).toEqual([playerId(9), playerId(2)]);
  });

  it('kicks a player with a full room (50 players)', () => {
    const full = makeState({ players: Array.from({ length: 50 }, (_, i) => makePlayer(i + 1)) });
    const after = ok(kick(full, nickname(50)));
    expect(after.players).toHaveLength(49);
    expect(after.kickedIds).toEqual([playerId(50)]);
  });

  it('works for a disconnected player', () => {
    const before = stateIn('LEADERBOARD', 3);
    const disconnected: GameState = {
      ...before,
      players: before.players.map((p) => (p.id === playerId(2) ? { ...p, connected: false } : p)),
    };
    const after = ok(kick(disconnected, nickname(2)));
    expect(after.players.map((p) => p.id)).toEqual([playerId(1), playerId(3)]);
    expect(after.kickedIds).toEqual([playerId(2)]);
  });

  it('rejects a kick in PODIUM with INVALID_PHASE', () => {
    expect(err(kick(stateIn('PODIUM', 3), nickname(2)))).toBe('INVALID_PHASE');
  });
});

describe('SPEC §3 Límites (host:kick): nickname matching like NICKNAME_TAKEN', () => {
  it.each([
    ['upper case', 'PLAYER2'],
    ['lower case', 'player2'],
    ['surrounding spaces', '  Player2  '],
    ['mixed case and spaces', ' pLaYeR2 '],
  ])('matches with %s', (_label, name) => {
    const after = ok(kick(stateIn('LOBBY', 3), name));
    expect(after.players.map((p) => p.id)).toEqual([playerId(1), playerId(3)]);
    expect(after.kickedIds).toEqual([playerId(2)]);
  });

  it('does not match a prefix or a substring of a nickname', () => {
    expect(err(kick(stateIn('LOBBY', 3), 'Player'))).toBe('PLAYER_NOT_FOUND');
  });

  it('rejects an unknown nickname with PLAYER_NOT_FOUND', () => {
    expect(err(kick(stateIn('LOBBY', 3), 'Nobody'))).toBe('PLAYER_NOT_FOUND');
  });

  it('rejects an unknown nickname in an empty room with PLAYER_NOT_FOUND', () => {
    expect(err(kick(stateIn('LOBBY', 0), nickname(1)))).toBe('PLAYER_NOT_FOUND');
  });

  it('kicking the same nickname twice fails the second time with PLAYER_NOT_FOUND', () => {
    const once = ok(kick(stateIn('LOBBY', 3), nickname(2)));
    expect(err(kick(once, nickname(2)))).toBe('PLAYER_NOT_FOUND');
  });
});

describe('SPEC §3 Límites (host:kick): answers to the current question', () => {
  it('drops the answer of the kicked player and keeps the others', () => {
    const before = stateIn('QUESTION', 3, {
      answers: { [playerId(1)]: { optionIndex: RIGHT, elapsedMs: 100 }, [playerId(2)]: { optionIndex: WRONG, elapsedMs: 200 } },
    });
    const after = ok(kick(before, nickname(2)));
    expect(after.phase).toBe('QUESTION');
    expect(after.answers).toEqual({ [playerId(1)]: { optionIndex: RIGHT, elapsedMs: 100 } });
  });

  it('keeps the answers unchanged when the kicked player had not answered', () => {
    const answers = { [playerId(1)]: { optionIndex: RIGHT, elapsedMs: 100 } };
    const after = ok(kick(stateIn('QUESTION', 3, { answers }), nickname(2)));
    expect(after.answers).toEqual(answers);
  });
});

describe('SPEC §3 Límites (host:kick): QUESTION → REVEAL when the rest already answered', () => {
  it('reveals and applies the score when every remaining connected player already answered', () => {
    const before = stateIn('QUESTION', 3, {
      answers: { [playerId(1)]: { optionIndex: RIGHT, elapsedMs: 2000 }, [playerId(3)]: { optionIndex: WRONG, elapsedMs: 500 } },
    });
    const after = ok(kick(before, nickname(2)));
    expect(after.phase).toBe('REVEAL');

    const expected = scoreAnswer({ correct: true, elapsedMs: 2000, limitMs: T, previousStreak: 2 });
    expect(findPlayer(after, playerId(1))).toMatchObject({
      score: 1850 + expected.points,
      streak: expected.streak,
      lastResult: { correct: true, points: expected.points, streak: expected.streak, totalScore: 1850 + expected.points },
    });
    expect(findPlayer(after, playerId(3))).toMatchObject({
      score: 0,
      streak: 0,
      lastResult: { correct: false, points: 0, streak: 0, totalScore: 0 },
    });
    expect(after.players.map((p) => p.id)).toEqual([playerId(1), playerId(3)]);
  });

  it('stays in QUESTION when another connected player still has to answer', () => {
    const before = stateIn('QUESTION', 3, { answers: { [playerId(1)]: { optionIndex: RIGHT, elapsedMs: 2000 } } });
    const after = ok(kick(before, nickname(2)));
    expect(after.phase).toBe('QUESTION');
    expect(findPlayer(after, playerId(1)).score).toBe(1850);
  });

  it('reveals when the remaining pending players are disconnected', () => {
    const before = stateIn('QUESTION', 3, { answers: { [playerId(1)]: { optionIndex: RIGHT, elapsedMs: 2000 } } });
    const withDisconnected: GameState = {
      ...before,
      players: before.players.map((p) => (p.id === playerId(3) ? { ...p, connected: false } : p)),
    };
    const after = ok(kick(withDisconnected, nickname(2)));
    expect(after.phase).toBe('REVEAL');
    // Disconnected eligible players are still scored (0 points) on reveal.
    expect(findPlayer(after, playerId(3)).lastResult).toEqual({ correct: false, points: 0, streak: 0, totalScore: 0 });
  });

  it('reveals when the only connected player is kicked (consistent with disconnect)', () => {
    const before = stateIn('QUESTION', 2);
    const onlyOneConnected: GameState = {
      ...before,
      players: before.players.map((p) => (p.id === playerId(2) ? { ...p, connected: false } : p)),
    };
    const after = ok(kick(onlyOneConnected, nickname(1)));
    expect(after.phase).toBe('REVEAL');
    expect(after.players.map((p) => p.id)).toEqual([playerId(2)]);
  });

  it('reveals when the only player in the room is kicked', () => {
    const after = ok(kick(stateIn('QUESTION', 1), nickname(1)));
    expect(after.phase).toBe('REVEAL');
    expect(after.players).toEqual([]);
  });

  it('a late joiner not yet eligible does not block the reveal and is left untouched', () => {
    const late = makePlayer(3, { eligibleFrom: 2 });
    const before = stateIn('QUESTION', 2, {
      players: [...players(2), late],
      answers: { [playerId(1)]: { optionIndex: RIGHT, elapsedMs: 2000 } },
    });
    const after = ok(kick(before, nickname(2)));
    expect(after.phase).toBe('REVEAL');
    expect(findPlayer(after, playerId(3))).toEqual(late);
  });

  it('the kicked player answer is not scored on reveal', () => {
    const before = stateIn('QUESTION', 2, {
      answers: { [playerId(1)]: { optionIndex: WRONG, elapsedMs: 2000 }, [playerId(2)]: { optionIndex: RIGHT, elapsedMs: 100 } },
    });
    const after = ok(kick(before, nickname(2)));
    expect(after.phase).toBe('REVEAL');
    expect(after.players.map((p) => p.id)).toEqual([playerId(1)]);
    expect(after.answers).toEqual({ [playerId(1)]: { optionIndex: WRONG, elapsedMs: 2000 } });
  });
});

describe('SPEC §3 Límites (host:kick): REVEAL and LEADERBOARD keep phase and scores', () => {
  it.each(['REVEAL', 'LEADERBOARD'] as const)('in %s the phase and the other players are unchanged', (phase) => {
    const before = stateIn(phase, 3, { answers: { [playerId(1)]: { optionIndex: RIGHT, elapsedMs: 2000 } } });
    const after = ok(kick(before, nickname(3)));
    expect(after.phase).toBe(phase);
    expect(after.questionIndex).toBe(1);
    expect(after.players).toEqual([at(before.players, 0), at(before.players, 1)]);
  });
});

describe('SPEC §3 Límites (host:kick): a kicked id cannot join again', () => {
  it.each([...KICKABLE, 'PODIUM'] as const)('join with a kicked id in %s fails with KICKED even if the nickname is free', (phase) => {
    const state = stateIn(phase, 1, { kickedIds: [playerId(2)] });
    expect(err(join(state, playerId(2), nickname(2)))).toBe('KICKED');
  });

  it('join with a kicked id and a different nickname fails with KICKED', () => {
    const state = stateIn('LOBBY', 1, { kickedIds: [playerId(2)] });
    expect(err(join(state, playerId(2), 'Otro'))).toBe('KICKED');
  });

  it('after kick, the same id is rejected with KICKED', () => {
    const kicked = ok(kick(stateIn('LOBBY', 3), nickname(2)));
    expect(err(join(kicked, playerId(2), nickname(2)))).toBe('KICKED');
  });

  it('after kick mid-game, the same id is rejected with KICKED', () => {
    const kicked = ok(kick(stateIn('LEADERBOARD', 3), nickname(2)));
    expect(err(join(kicked, playerId(2), nickname(2)))).toBe('KICKED');
  });

  it('a new id with the same nickname joins as a new player with score 0', () => {
    const kicked = ok(kick(stateIn('LOBBY', 3), nickname(1)));
    const after = ok(join(kicked, playerId(7), nickname(1)));
    expect(findPlayer(after, playerId(7))).toEqual(makePlayer(7, { nickname: nickname(1) }));
    expect(at(after.players, after.players.length - 1).id).toBe(playerId(7));
  });

  it('a new id with the kicked nickname mid-game joins as a late joiner with score 0', () => {
    const kicked = ok(kick(stateIn('LEADERBOARD', 3), nickname(1)));
    const after = ok(join(kicked, playerId(7), nickname(1)));
    expect(findPlayer(after, playerId(7))).toMatchObject({ nickname: nickname(1), score: 0, streak: 0, lastResult: null, eligibleFrom: 2 });
  });

  it('kicking frees the nickname for a different id (case-insensitive)', () => {
    const before = stateIn('LOBBY', 3);
    expect(err(join(before, playerId(7), 'player2'))).toBe('NICKNAME_TAKEN');
    const kicked = ok(kick(before, nickname(2)));
    expect(ok(join(kicked, playerId(7), 'player2')).players.map((p) => p.nickname)).toContain('player2');
  });
});

describe('SPEC §3 Límites (host:kick): purity', () => {
  it.each(KICKABLE)('does not mutate the input state in %s', (phase) => {
    const before = deepFreeze(
      stateIn(phase, 3, phase === 'QUESTION' ? { answers: { [playerId(2)]: { optionIndex: RIGHT, elapsedMs: 10 } } } : {}),
    );
    const snapshot = structuredClone(before);
    expect(() => kick(before, nickname(2))).not.toThrow();
    expect(before).toEqual(snapshot);
  });

  it('does not mutate the input when the kick reveals the question', () => {
    const before = deepFreeze(stateIn('QUESTION', 2, { answers: { [playerId(1)]: { optionIndex: RIGHT, elapsedMs: 10 } } }));
    const snapshot = structuredClone(before);
    expect(ok(kick(before, nickname(2))).phase).toBe('REVEAL');
    expect(before).toEqual(snapshot);
  });

  it('does not depend on now', () => {
    const before = stateIn('LOBBY', 3);
    expect(kick(before, nickname(2), 0)).toEqual(kick(before, nickname(2), NOW + 10 * T));
  });
});

import { describe, expect, it } from 'vitest';
import {
  GameEndPayloadSchema,
  LEADERBOARD_SIZE,
  LeaderboardPayloadSchema,
  PODIUM_SIZE,
  QUESTION_TIME_MS,
  QuestionRevealPayloadSchema,
  QuestionStartPayloadSchema,
  RoomStatePayloadSchema,
} from '@preguntica/shared';
import type { Phase } from '@preguntica/shared';
import type { GameState } from './types.js';
import { toLeaderboard, toPodium, toQuestionStart, toReveal, toRoomState } from './views.js';
import { NOW, ROOM_CODE, at, makePlayer, makeQuestions, makeState, nickname, playerId } from './test-helpers.js';

const T = QUESTION_TIME_MS;
const ALL_PHASES: Phase[] = ['GENERATING', 'LOBBY', 'QUESTION', 'REVEAL', 'LEADERBOARD', 'PODIUM'];

/** Question 1 (index 1) has correctIndex 1 with makeQuestions' default cycle. */
function questionState(phase: Phase = 'QUESTION', overrides: Partial<GameState> = {}): GameState {
  return makeState({
    phase,
    players: [makePlayer(1), makePlayer(2), makePlayer(3)],
    questionIndex: 1,
    questionStartedAt: NOW,
    questionEndsAt: NOW + T,
    ...overrides,
  });
}

/** Players with given scores, in join order (player n has nickname PlayerN). */
function rankedState(scores: number[], phase: Phase = 'LEADERBOARD'): GameState {
  return questionState(phase, {
    players: scores.map((score, i) =>
      makePlayer(i + 1, { score, lastResult: { correct: score > 0, points: Math.min(score, 700), streak: 0, totalScore: score } }),
    ),
  });
}

describe('CLAUDE.md rule #2 / SPEC §3: toRoomState (public room view)', () => {
  it('maps the state to the public payload', () => {
    const state = makeState({
      phase: 'LOBBY',
      players: [makePlayer(1, { score: 300 }), makePlayer(2, { connected: false })],
    });
    const payload = RoomStatePayloadSchema.parse(toRoomState(state));
    expect(payload).toEqual({
      roomCode: ROOM_CODE,
      phase: 'LOBBY',
      topic: 'Costa Rica',
      players: [
        { nickname: nickname(1), score: 300, connected: true },
        { nickname: nickname(2), score: 0, connected: false },
      ],
      questionIndex: null,
      totalQuestions: 5,
    });
  });

  it('never leaks player ids', () => {
    const state = makeState({ players: [makePlayer(1), makePlayer(2)] });
    const json = JSON.stringify(toRoomState(state));
    expect(json).not.toContain(playerId(1));
    expect(json).not.toContain(playerId(2));
    expect(json).not.toContain('"id"');
  });

  it('never leaks questions or answers', () => {
    const json = JSON.stringify(toRoomState(questionState()));
    expect(json).not.toContain('correctIndex');
    expect(json).not.toContain('Explanation for question');
  });

  it.each(ALL_PHASES)('produces a schema-valid payload in %s', (phase) => {
    const state = questionState(phase, { questionIndex: phase === 'GENERATING' || phase === 'LOBBY' ? null : 1 });
    const payload = RoomStatePayloadSchema.parse(toRoomState(state));
    expect(payload.phase).toBe(phase);
  });

  it('reports the current question index during the game', () => {
    expect(RoomStatePayloadSchema.parse(toRoomState(questionState())).questionIndex).toBe(1);
  });

  it('works with an empty room', () => {
    expect(RoomStatePayloadSchema.parse(toRoomState(makeState())).players).toEqual([]);
  });
});

describe('CLAUDE.md rule #2: toQuestionStart never includes the answer', () => {
  it.each(ALL_PHASES.filter((p) => p !== 'QUESTION'))('returns null in %s', (phase) => {
    expect(toQuestionStart(questionState(phase))).toBeNull();
  });

  it('returns the current question without the answer in QUESTION', () => {
    const questions = makeQuestions(5);
    const current = at(questions, 1);
    const payload = QuestionStartPayloadSchema.parse(toQuestionStart(questionState('QUESTION', { questions })));
    expect(payload).toEqual({
      index: 1,
      total: 5,
      prompt: current.prompt,
      options: current.options,
      endsAt: NOW + T,
    });
  });

  it('serialized payload contains neither correctIndex nor the explanation', () => {
    const questions = makeQuestions(5);
    const json = JSON.stringify(toQuestionStart(questionState('QUESTION', { questions })));
    expect(json).not.toContain('correctIndex');
    expect(json).not.toContain(at(questions, 1).explanation);
  });
});

describe('SPEC §3 REVEAL: toReveal (correct answer, distribution, explanation)', () => {
  it.each(ALL_PHASES.filter((p) => p !== 'REVEAL'))('returns null in %s', (phase) => {
    expect(toReveal(questionState(phase))).toBeNull();
    expect(toReveal(questionState(phase), playerId(1))).toBeNull();
  });

  it('includes correctIndex, vote distribution and explanation', () => {
    const questions = makeQuestions(5);
    const state = questionState('REVEAL', {
      questions,
      players: [makePlayer(1), makePlayer(2), makePlayer(3), makePlayer(4)],
      answers: {
        [playerId(1)]: { optionIndex: 1, elapsedMs: 100 },
        [playerId(2)]: { optionIndex: 3, elapsedMs: 200 },
        [playerId(3)]: { optionIndex: 1, elapsedMs: 300 },
      },
    });
    const payload = QuestionRevealPayloadSchema.parse(toReveal(state));
    expect(payload).toEqual({
      correctIndex: 1,
      distribution: [0, 2, 0, 1],
      explanation: at(questions, 1).explanation,
    });
    expect('yourResult' in payload).toBe(false);
  });

  it('distribution is all zeros when nobody answered', () => {
    const payload = QuestionRevealPayloadSchema.parse(toReveal(questionState('REVEAL', { answers: {} })));
    expect(payload.distribution).toEqual([0, 0, 0, 0]);
  });

  it('with a playerId includes that player lastResult as yourResult', () => {
    const result = { correct: true, points: 850, streak: 1, totalScore: 850 };
    const state = questionState('REVEAL', {
      players: [makePlayer(1, { score: 850, streak: 1, lastResult: result }), makePlayer(2)],
      answers: { [playerId(1)]: { optionIndex: 1, elapsedMs: 6000 } },
    });
    const payload = QuestionRevealPayloadSchema.parse(toReveal(state, playerId(1)));
    expect(payload.yourResult).toEqual(result);
    expect(payload.correctIndex).toBe(1);
  });

  it('yourResult belongs to the requested player, not another one', () => {
    const r1 = { correct: true, points: 1000, streak: 1, totalScore: 1000 };
    const r2 = { correct: false, points: 0, streak: 0, totalScore: 400 };
    const state = questionState('REVEAL', {
      players: [makePlayer(1, { lastResult: r1, score: 1000 }), makePlayer(2, { lastResult: r2, score: 400 })],
    });
    expect(QuestionRevealPayloadSchema.parse(toReveal(state, playerId(2))).yourResult).toEqual(r2);
  });

  it('does not leak player ids', () => {
    const state = questionState('REVEAL', {
      players: [makePlayer(1, { lastResult: { correct: false, points: 0, streak: 0, totalScore: 0 } })],
      answers: { [playerId(1)]: { optionIndex: 0, elapsedMs: 1 } },
    });
    expect(JSON.stringify(toReveal(state, playerId(1)))).not.toContain(playerId(1));
  });
});

describe(`SPEC §3 LEADERBOARD: toLeaderboard (top ${LEADERBOARD_SIZE})`, () => {
  it('sorts by score descending', () => {
    const payload = LeaderboardPayloadSchema.parse(toLeaderboard(rankedState([100, 900, 500])));
    expect(payload.top.map((e) => e.nickname)).toEqual([nickname(2), nickname(3), nickname(1)]);
    expect(payload.top.map((e) => e.score)).toEqual([900, 500, 100]);
  });

  it('breaks ties by join order', () => {
    const payload = LeaderboardPayloadSchema.parse(toLeaderboard(rankedState([500, 800, 500, 800])));
    expect(payload.top.map((e) => e.nickname)).toEqual([nickname(2), nickname(4), nickname(1), nickname(3)]);
  });

  it(`returns only ${LEADERBOARD_SIZE} entries with 7 players`, () => {
    const payload = LeaderboardPayloadSchema.parse(toLeaderboard(rankedState([10, 70, 30, 60, 20, 50, 40])));
    expect(payload.top).toHaveLength(LEADERBOARD_SIZE);
    expect(payload.top.map((e) => e.score)).toEqual([70, 60, 50, 40, 30]);
  });

  it('returns exactly 5 entries with exactly 5 players', () => {
    expect(LeaderboardPayloadSchema.parse(toLeaderboard(rankedState([1, 2, 3, 4, 5]))).top).toHaveLength(5);
  });

  it('delta is the points of the last question (lastResult.points)', () => {
    const state = questionState('LEADERBOARD', {
      players: [
        makePlayer(1, { score: 1750, lastResult: { correct: true, points: 750, streak: 2, totalScore: 1750 } }),
        makePlayer(2, { score: 2000, lastResult: { correct: false, points: 0, streak: 0, totalScore: 2000 } }),
      ],
    });
    expect(LeaderboardPayloadSchema.parse(toLeaderboard(state))).toEqual({
      top: [
        { nickname: nickname(2), score: 2000, delta: 0 },
        { nickname: nickname(1), score: 1750, delta: 750 },
      ],
    });
  });

  it('delta is 0 when lastResult is null', () => {
    const state = questionState('LEADERBOARD', { players: [makePlayer(1, { score: 0, lastResult: null })] });
    expect(LeaderboardPayloadSchema.parse(toLeaderboard(state)).top).toEqual([{ nickname: nickname(1), score: 0, delta: 0 }]);
  });

  it('includes disconnected players', () => {
    const state = questionState('LEADERBOARD', { players: [makePlayer(1, { score: 300, connected: false })] });
    expect(LeaderboardPayloadSchema.parse(toLeaderboard(state)).top).toHaveLength(1);
  });

  it('returns an empty list with no players', () => {
    expect(LeaderboardPayloadSchema.parse(toLeaderboard(questionState('LEADERBOARD', { players: [] })))).toEqual({ top: [] });
  });

  it('does not reorder the state players (no mutation)', () => {
    const state = rankedState([100, 900, 500]);
    toLeaderboard(state);
    expect(state.players.map((p) => p.id)).toEqual([playerId(1), playerId(2), playerId(3)]);
  });
});

describe(`SPEC §3 PODIUM: toPodium (top ${PODIUM_SIZE})`, () => {
  it('returns the top 3 with ranks 1..3', () => {
    const payload = GameEndPayloadSchema.parse(toPodium(rankedState([400, 1200, 800, 100, 900], 'PODIUM')));
    expect(payload).toEqual({
      podium: [
        { rank: 1, nickname: nickname(2), score: 1200 },
        { rank: 2, nickname: nickname(5), score: 900 },
        { rank: 3, nickname: nickname(3), score: 800 },
      ],
    });
  });

  it('breaks ties by join order', () => {
    const payload = GameEndPayloadSchema.parse(toPodium(rankedState([700, 700, 700, 700], 'PODIUM')));
    expect(payload.podium.map((e) => e.nickname)).toEqual([nickname(1), nickname(2), nickname(3)]);
    expect(payload.podium.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it('returns fewer entries with fewer than 3 players', () => {
    const payload = GameEndPayloadSchema.parse(toPodium(rankedState([300, 500], 'PODIUM')));
    expect(payload.podium).toEqual([
      { rank: 1, nickname: nickname(2), score: 500 },
      { rank: 2, nickname: nickname(1), score: 300 },
    ]);
  });

  it('returns an empty podium with no players', () => {
    expect(GameEndPayloadSchema.parse(toPodium(questionState('PODIUM', { players: [] })))).toEqual({ podium: [] });
  });

  it('does not leak player ids', () => {
    expect(JSON.stringify(toPodium(rankedState([1, 2, 3], 'PODIUM')))).not.toContain(playerId(1));
  });
});

import {
  LEADERBOARD_SIZE,
  OPTIONS_PER_QUESTION,
  PODIUM_SIZE,
  type GameEndPayload,
  type LeaderboardPayload,
  type Question,
  type QuestionRevealPayload,
  type QuestionStartPayload,
  type RoomStatePayload,
} from '@preguntica/shared';
import type { GameState, Player } from './types.js';

// Views build S→C payloads field by field (never by spreading state) so that
// answers and player ids cannot leak by accident (CLAUDE.md rule #2).

export function toRoomState(state: GameState): RoomStatePayload {
  return {
    roomCode: state.code,
    phase: state.phase,
    topic: state.topic,
    players: state.players.map(({ nickname, score, connected }) => ({ nickname, score, connected })),
    questionIndex: state.questionIndex,
    totalQuestions: state.totalQuestions,
  };
}

/** Null outside QUESTION. Never includes the answer. */
export function toQuestionStart(state: GameState): QuestionStartPayload | null {
  const question = currentQuestion(state);
  if (state.phase !== 'QUESTION' || question === null || state.questionEndsAt === null) return null;
  return {
    index: question.index,
    total: state.totalQuestions,
    prompt: question.prompt,
    options: question.options,
    endsAt: state.questionEndsAt,
  };
}

/** Null outside REVEAL. With a playerId, includes that player's result. */
export function toReveal(state: GameState, playerId?: string): QuestionRevealPayload | null {
  const question = currentQuestion(state);
  if (state.phase !== 'REVEAL' || question === null) return null;

  const distribution = Array.from({ length: OPTIONS_PER_QUESTION }, () => 0);
  for (const { optionIndex } of Object.values(state.answers)) {
    distribution[optionIndex] = (distribution[optionIndex] ?? 0) + 1;
  }

  const payload: QuestionRevealPayload = {
    correctIndex: question.correctIndex,
    distribution,
    explanation: question.explanation,
  };
  const yourResult = state.players.find((p) => p.id === playerId)?.lastResult;
  if (yourResult) payload.yourResult = yourResult;
  return payload;
}

export function toLeaderboard(state: GameState): LeaderboardPayload {
  return {
    top: ranking(state.players)
      .slice(0, LEADERBOARD_SIZE)
      .map(({ nickname, score, lastResult }) => ({ nickname, score, delta: lastResult?.points ?? 0 })),
  };
}

export function toPodium(state: GameState): GameEndPayload {
  return {
    podium: ranking(state.players)
      .slice(0, PODIUM_SIZE)
      .map(({ nickname, score }, i) => ({ rank: i + 1, nickname, score })),
  };
}

/** Score descending; ties keep join order (Array.prototype.sort is stable). */
function ranking(players: readonly Player[]): Player[] {
  return [...players].sort((a, b) => b.score - a.score);
}

function currentQuestion(state: GameState): (Question & { index: number }) | null {
  if (state.questionIndex === null) return null;
  const question = state.questions[state.questionIndex];
  return question === undefined ? null : { ...question, index: state.questionIndex };
}

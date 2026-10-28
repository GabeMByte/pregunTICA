import type {
  GameEndPayload,
  LeaderboardPayload,
  QuestionRevealPayload,
  QuestionStartPayload,
  RoomStatePayload,
} from '@preguntica/shared';
import { notImplemented } from './not-implemented.js';
import type { GameState } from './types.js';

export function toRoomState(state: GameState): RoomStatePayload {
  return notImplemented(state);
}

/** Null outside QUESTION. Never includes the answer. */
export function toQuestionStart(state: GameState): QuestionStartPayload | null {
  return notImplemented(state);
}

/** Null outside REVEAL. With a playerId, includes that player's result. */
export function toReveal(state: GameState, playerId?: string): QuestionRevealPayload | null {
  return notImplemented(state, playerId);
}

export function toLeaderboard(state: GameState): LeaderboardPayload {
  return notImplemented(state);
}

export function toPodium(state: GameState): GameEndPayload {
  return notImplemented(state);
}

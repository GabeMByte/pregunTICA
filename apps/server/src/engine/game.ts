import { notImplemented } from './not-implemented.js';
import type { EngineResult, GameAction, GameState, NewGame } from './types.js';

export function createGame(game: NewGame): GameState {
  return notImplemented(game);
}

export function reduce(state: GameState, action: GameAction, now: number): EngineResult {
  return notImplemented(state, action, now);
}

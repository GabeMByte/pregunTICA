import type {
  GameEndPayload,
  LeaderboardEntry,
  LeaderboardPayload,
  PodiumEntry,
  QuestionRevealPayload,
  QuestionStartPayload,
  RoomStatePayload,
} from '@preguntica/shared';
import type { GameError, GameErrorCode } from './requests.js';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

/** What both views know about the game; each view adds its own session. */
export interface BaseGameState {
  connection: ConnectionStatus;
  room: RoomStatePayload | null;
  question: QuestionStartPayload | null;
  reveal: QuestionRevealPayload | null;
  leaderboard: LeaderboardEntry[] | null;
  podium: PodiumEntry[] | null;
  error: GameError | null;
}

export const initialBaseState: BaseGameState = {
  connection: 'connecting',
  room: null,
  question: null,
  reveal: null,
  leaderboard: null,
  podium: null,
  error: null,
};

/** Server events and connection changes, shared by both views. Payloads are already validated. */
export type BaseAction =
  | { type: 'connection'; status: ConnectionStatus }
  | { type: 'room:state'; payload: RoomStatePayload }
  | { type: 'question:start'; payload: QuestionStartPayload }
  | { type: 'question:reveal'; payload: QuestionRevealPayload }
  | { type: 'leaderboard'; payload: LeaderboardPayload }
  | { type: 'game:end'; payload: GameEndPayload }
  | { type: 'error'; payload: GameError }
  | { type: 'error:dismiss' };

/** After these the stored session is useless: the room is gone or the player was removed. */
export const SESSION_ENDING_ERRORS: readonly GameErrorCode[] = ['ROOM_NOT_FOUND', 'KICKED'];

export function isBaseAction(action: { type: string }): action is BaseAction {
  return BASE_TYPES.has(action.type);
}

const BASE_TYPES = new Set<string>([
  'connection',
  'room:state',
  'question:start',
  'question:reveal',
  'leaderboard',
  'game:end',
  'error',
  'error:dismiss',
]);

export function baseReducer<S extends BaseGameState>(state: S, action: BaseAction): S {
  switch (action.type) {
    case 'connection':
      return { ...state, connection: action.status };
    case 'room:state':
      return { ...state, room: action.payload };
    case 'question:start':
      return { ...state, question: action.payload, reveal: null, leaderboard: null };
    case 'question:reveal':
      return { ...state, reveal: action.payload };
    case 'leaderboard':
      return { ...state, leaderboard: action.payload.top };
    case 'game:end':
      return { ...state, podium: action.payload.podium };
    case 'error':
      return { ...state, error: action.payload };
    case 'error:dismiss':
      return { ...state, error: null };
  }
}

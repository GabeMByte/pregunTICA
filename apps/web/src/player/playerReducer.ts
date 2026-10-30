import type { PlayerJoinedPayload } from '@preguntica/shared';
import { baseReducer, initialBaseState, isBaseAction, SESSION_ENDING_ERRORS, type BaseAction, type BaseGameState } from '../game/game-state.js';
import type { PlayerSession } from '../net/storage.js';

export interface PlayerState extends BaseGameState {
  session: PlayerSession | null;
  /** Joined mid-question: plays from the next one. */
  waitingForNextQuestion: boolean;
  /** The option this player picked in the current question. */
  selectedOption: number | null;
  /** A join was sent and the server has not answered yet. */
  joining: boolean;
  /** game:end ends the session, but the final screen still needs to find this player. */
  finalNickname: string | null;
}

export type PlayerAction =
  | BaseAction
  | { type: 'joining' }
  | { type: 'player:joined'; payload: PlayerJoinedPayload; roomCode: string }
  | { type: 'answer'; optionIndex: number };

export function initialPlayerState(session: PlayerSession | null): PlayerState {
  return { ...initialBaseState, session, waitingForNextQuestion: false, selectedOption: null, joining: false, finalNickname: null };
}

/** One answer per question, and only while it is open (SPEC §3). */
export function canAnswer(state: PlayerState): boolean {
  return state.question !== null && state.reveal === null && state.selectedOption === null && !state.waitingForNextQuestion;
}

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'joining':
      return { ...state, joining: true, error: null };
    case 'player:joined': {
      const { playerId, nickname, waitingForNextQuestion } = action.payload;
      return { ...state, session: { roomCode: action.roomCode, playerId, nickname }, waitingForNextQuestion, joining: false, error: null };
    }
    case 'answer':
      return canAnswer(state) ? { ...state, selectedOption: action.optionIndex } : state;
  }
  if (!isBaseAction(action)) return state;

  const next = baseReducer(state, action);
  switch (action.type) {
    case 'connection':
      return action.status === 'disconnected' ? { ...next, joining: false } : next;
    case 'question:start': {
      // A reconnection snapshot repeats the current question: the answer already given still stands.
      const sameQuestion = state.question?.index === action.payload.index;
      return { ...next, selectedOption: sameQuestion ? state.selectedOption : null, waitingForNextQuestion: false };
    }
    case 'error': {
      const failed = { ...next, joining: false };
      if (!SESSION_ENDING_ERRORS.includes(action.payload.code)) return failed;
      return { ...failed, session: null, room: null, question: null, reveal: null, leaderboard: null, selectedOption: null };
    }
    case 'game:end':
      return { ...next, session: null, finalNickname: state.session?.nickname ?? state.finalNickname };
    default:
      return next;
  }
}

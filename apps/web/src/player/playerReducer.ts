import type { PlayerJoinedPayload } from '@preguntica/shared';
import { baseReducer, initialBaseState, isBaseAction, SESSION_ENDING_ERRORS, type BaseAction, type BaseGameState } from '../game/game-state.js';
import type { PlayerSession } from '../net/storage.js';

export interface PlayerState extends BaseGameState {
  session: PlayerSession | null;
  /** Joined mid-question: plays from the next one. */
  waitingForNextQuestion: boolean;
  /** The option this player picked in the current question. */
  selectedOption: number | null;
}

export type PlayerAction =
  | BaseAction
  | { type: 'player:joined'; payload: PlayerJoinedPayload; roomCode: string }
  | { type: 'answer'; optionIndex: number };

export function initialPlayerState(session: PlayerSession | null): PlayerState {
  return { ...initialBaseState, session, waitingForNextQuestion: false, selectedOption: null };
}

/** One answer per question, and only while it is open (SPEC §3). */
export function canAnswer(state: PlayerState): boolean {
  return state.question !== null && state.reveal === null && state.selectedOption === null && !state.waitingForNextQuestion;
}

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'player:joined': {
      const { playerId, nickname, waitingForNextQuestion } = action.payload;
      return { ...state, session: { roomCode: action.roomCode, playerId, nickname }, waitingForNextQuestion, error: null };
    }
    case 'answer':
      return canAnswer(state) ? { ...state, selectedOption: action.optionIndex } : state;
  }
  if (!isBaseAction(action)) return state;

  const next = baseReducer(state, action);
  switch (action.type) {
    case 'question:start':
      return { ...next, selectedOption: null, waitingForNextQuestion: false };
    case 'error':
      return SESSION_ENDING_ERRORS.includes(action.payload.code) ? { ...next, session: null } : next;
    case 'game:end':
      return { ...next, session: null };
    default:
      return next;
  }
}

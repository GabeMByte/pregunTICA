import type { HostCreatedPayload } from '@preguntica/shared';
import { baseReducer, initialBaseState, isBaseAction, SESSION_ENDING_ERRORS, type BaseAction, type BaseGameState } from '../game/game-state.js';
import type { HostSession } from '../net/storage.js';

export interface HostState extends BaseGameState {
  session: HostSession | null;
}

export type HostAction = BaseAction | { type: 'host:created'; payload: HostCreatedPayload };

export function initialHostState(session: HostSession | null): HostState {
  return { ...initialBaseState, session };
}

export function hostReducer(state: HostState, action: HostAction): HostState {
  if (action.type === 'host:created') return { ...state, session: action.payload, error: null };
  if (!isBaseAction(action)) return state;

  const next = baseReducer(state, action);
  if (action.type === 'error' && SESSION_ENDING_ERRORS.includes(action.payload.code)) return { ...next, session: null };
  if (action.type === 'game:end') return { ...next, session: null };
  return next;
}

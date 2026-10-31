import type { HostCreatedPayload } from '@preguntica/shared';
import { baseReducer, initialBaseState, isBaseAction, SESSION_ENDING_ERRORS, type BaseAction, type BaseGameState } from '../game/game-state.js';
import type { GameErrorCode } from '../game/requests.js';
import type { HostSession } from '../net/storage.js';

export interface HostState extends BaseGameState {
  session: HostSession | null;
  /** host:create is on its way: every attempt counts for the room limit, so it is sent only once. */
  creating: boolean;
}

export type HostAction = BaseAction | { type: 'create' } | { type: 'host:created'; payload: HostCreatedPayload };

/** A rejected topic closes the room too (SPEC §6), so the host goes back to the form. */
export const HOST_SESSION_ENDING_ERRORS: readonly GameErrorCode[] = [...SESSION_ENDING_ERRORS, 'TOPIC_REJECTED'];

export function initialHostState(session: HostSession | null): HostState {
  return { ...initialBaseState, session, creating: false };
}

export function hostReducer(state: HostState, action: HostAction): HostState {
  if (action.type === 'create') return { ...state, creating: true, error: null };
  if (action.type === 'host:created') return { ...state, session: action.payload, creating: false, error: null };
  if (!isBaseAction(action)) return state;

  const next = baseReducer(state, action);
  if (action.type === 'error') {
    if (!HOST_SESSION_ENDING_ERRORS.includes(action.payload.code)) return { ...next, creating: false };
    return { ...initialHostState(null), connection: next.connection, error: next.error };
  }
  if (action.type === 'game:end') return { ...next, session: null };
  return next;
}

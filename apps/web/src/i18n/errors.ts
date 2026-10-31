import type { GameError, GameErrorCode } from '../game/requests.js';
import type { Dictionary } from './es.js';

export type ErrorOverrides = Partial<Record<GameErrorCode, string>>;

/**
 * The text for an error, by its code: the context's own wording first (the join form, the host),
 * then the generic one. The server's message is only a fallback for a code this client does not know.
 */
export function errorText(t: Dictionary, { code, message }: GameError, overrides: ErrorOverrides = {}): string {
  return overrides[code] ?? (Object.hasOwn(t.errors, code) ? t.errors[code] : message);
}

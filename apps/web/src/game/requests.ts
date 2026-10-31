import type { ErrorCode } from '@preguntica/shared';

/** The server answers host:create and player:join at once; this long without an answer means it is lost. */
export const REQUEST_TIMEOUT_MS = 10_000;

/** Failures only the client sees: they have their own codes so the dictionaries can translate them. */
export type ClientErrorCode = 'SEND_FAILED' | 'NO_RESPONSE';
export type GameErrorCode = ErrorCode | ClientErrorCode;

/**
 * What the views show. The text comes from the dictionary by code (src/i18n/errors.ts); `message`
 * is the server's text, kept only as a fallback for a code the client does not know.
 */
export interface GameError {
  code: GameErrorCode;
  message: string;
}

/** Shown like any server error so a tap never fails in silence. */
export const SEND_FAILED: GameError = { code: 'SEND_FAILED', message: 'SEND_FAILED' };
export const NO_RESPONSE: GameError = { code: 'NO_RESPONSE', message: 'NO_RESPONSE' };

/** One pending request at a time: start() replaces the previous one, settle() cancels it. */
export function createRequestTimer(onTimeout: () => void, timeoutMs = REQUEST_TIMEOUT_MS) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settle = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  return {
    start() {
      settle();
      timer = setTimeout(() => {
        timer = undefined;
        onTimeout();
      }, timeoutMs);
    },
    settle,
  };
}

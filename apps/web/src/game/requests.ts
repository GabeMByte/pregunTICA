import type { ErrorPayload } from '@preguntica/shared';

/** The server answers host:create and player:join at once; this long without an answer means it is lost. */
export const REQUEST_TIMEOUT_MS = 10_000;

/** Client-side failures, shown like any server error so a tap never fails in silence. */
export const SEND_FAILED: ErrorPayload = {
  code: 'INTERNAL',
  message: 'No se pudo enviar. Recarga la página e intenta de nuevo.',
};

export const NO_RESPONSE: ErrorPayload = {
  code: 'INTERNAL',
  message: 'El servidor no respondió. Revisa tu conexión e intenta de nuevo.',
};

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

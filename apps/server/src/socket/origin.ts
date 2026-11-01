/**
 * SPEC §10: a page on another site must not open a socket to the game from a visitor's browser.
 * A WebSocket upgrade skips CORS, so the handshake checks Origin itself. A request without Origin
 * is not a browser page (browsers always send it on sockets), and such a client could fake it anyway.
 */
export function isAllowedOrigin(origin: string | undefined, publicOrigin: string | undefined): boolean {
  if (publicOrigin === undefined || origin === undefined) return true;
  try {
    return new URL(origin).origin === publicOrigin;
  } catch {
    return false;
  }
}

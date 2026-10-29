import type { IncomingHttpHeaders } from 'node:http';

export interface HandshakeInfo {
  address: string;
  headers: IncomingHttpHeaders;
}

/**
 * Client IP for rate limiting (SPEC §3 Límites).
 * Without TRUST_PROXY the socket address is used and X-Forwarded-For is ignored, since any
 * client can send it. Behind one trusted proxy (Render/Railway) the proxy *appends* the real
 * client IP, so the last value is the one to trust; earlier values are client-controlled.
 */
export function getClientIp({ address, headers }: HandshakeInfo, trustProxy: boolean): string {
  if (!trustProxy) return address;
  const header = headers['x-forwarded-for'];
  const raw = Array.isArray(header) ? header.join(',') : (header ?? '');
  const last = raw.split(',').map((value) => value.trim()).filter((value) => value !== '').at(-1);
  return last ?? address;
}

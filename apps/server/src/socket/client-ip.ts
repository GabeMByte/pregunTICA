import { isIPv6 } from 'node:net';
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

const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/**
 * Key for the room creation limit (security review M3). One IPv6 subscriber usually gets a whole
 * /64, so every address in it shares a key; otherwise each would be a fresh limit.
 * IPv4 (also when IPv4-mapped) is its own key; anything that is not an IP is kept as is.
 */
export function rateLimitKey(ip: string): string {
  const mapped = IPV4_MAPPED.exec(ip);
  if (mapped?.[1] !== undefined) return mapped[1];
  if (!isIPv6(ip)) return ip;
  const [head = '', tail] = ip.toLowerCase().split('::');
  const left = head === '' ? [] : head.split(':');
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  const groups = tail === undefined ? left : [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right];
  const prefix = groups.slice(0, 4).map((group) => Number.parseInt(group, 16).toString(16));
  return `${prefix.join(':')}::/64`;
}

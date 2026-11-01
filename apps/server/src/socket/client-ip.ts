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

/** Longest X-Forwarded-For kept in the log: a few hops fit, a flood from a client does not. */
const MAX_LOGGED_HEADER = 200;
// eslint-disable-next-line no-control-regex -- control characters are exactly what it removes.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

/** The IP comes from the header too: every part of the line is cleaned and capped. */
const forLog = (value: string): string => value.replace(CONTROL_CHARACTERS, ' ').slice(0, MAX_LOGGED_HEADER);

/**
 * The line logged once per connection behind a trusted proxy, to check in production that the
 * limiter takes the right hop. Only addresses: no nickname, token or other header. The header is
 * client-controlled, so control characters (fake log lines) are removed and its length capped.
 */
export function describeClientAddress(handshake: HandshakeInfo): string {
  const ip = getClientIp(handshake, true);
  const header = handshake.headers['x-forwarded-for'];
  const raw = Array.isArray(header) ? header.join(', ') : (header ?? '');
  return `Client address: rate-limit key ${forLog(rateLimitKey(ip))} (ip ${forLog(ip)}), X-Forwarded-For: ${raw === '' ? '(none)' : forLog(raw)}`;
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

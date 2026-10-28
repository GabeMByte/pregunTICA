import { describe, expect, it } from 'vitest';
import { getClientIp } from './client-ip.js';

const SOCKET_IP = '10.0.0.5';

function handshake(xForwardedFor?: string | string[]) {
  return { address: SOCKET_IP, headers: xForwardedFor === undefined ? {} : { 'x-forwarded-for': xForwardedFor } };
}

describe('SPEC §3 Límites: client IP for the room creation limit', () => {
  it('uses the socket address and ignores X-Forwarded-For when TRUST_PROXY is off', () => {
    expect(getClientIp(handshake('203.0.113.9'), false)).toBe(SOCKET_IP);
  });

  it('uses the value appended by the trusted proxy (the last one) when TRUST_PROXY is on', () => {
    expect(getClientIp(handshake('203.0.113.9'), true)).toBe('203.0.113.9');
    expect(getClientIp(handshake('1.2.3.4, 203.0.113.9'), true)).toBe('203.0.113.9');
  });

  it('cannot be spoofed by a client-supplied first value', () => {
    expect(getClientIp(handshake('6.6.6.6,  203.0.113.9 '), true)).toBe('203.0.113.9');
  });

  it('handles repeated headers', () => {
    expect(getClientIp(handshake(['1.2.3.4', '203.0.113.9']), true)).toBe('203.0.113.9');
  });

  it('falls back to the socket address when the header is missing or empty', () => {
    expect(getClientIp(handshake(), true)).toBe(SOCKET_IP);
    expect(getClientIp(handshake(' , '), true)).toBe(SOCKET_IP);
  });
});

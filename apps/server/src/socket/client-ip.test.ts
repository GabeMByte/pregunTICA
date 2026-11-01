import { describe, expect, it } from 'vitest';
import { describeClientAddress, getClientIp, rateLimitKey } from './client-ip.js';

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

describe('security review M3: rate limit key', () => {
  it('an IPv4 address is its own key', () => {
    expect(rateLimitKey('203.0.113.7')).toBe('203.0.113.7');
  });

  it('an IPv4-mapped IPv6 address is the IPv4 address', () => {
    expect(rateLimitKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('IPv6 addresses of the same /64 share one key, whatever their notation', () => {
    const key = rateLimitKey('2001:db8:aa:bb::1');
    expect(rateLimitKey('2001:db8:aa:bb:ffff:ffff:ffff:ffff')).toBe(key);
    expect(rateLimitKey('2001:0DB8:00aa:00bb:1:2:3:4')).toBe(key);
    expect(key).toBe('2001:db8:aa:bb::/64');
  });

  it('a different /64 is a different key', () => {
    expect(rateLimitKey('2001:db8:aa:bc::1')).not.toBe(rateLimitKey('2001:db8:aa:bb::1'));
  });

  it('expands "::" before taking the prefix', () => {
    expect(rateLimitKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(rateLimitKey('::1')).toBe('0:0:0:0::/64');
  });

  it('anything that is not an IP is kept as is', () => {
    expect(rateLimitKey('unknown')).toBe('unknown');
  });
});

describe('the proxy log line (TRUST_PROXY): which hop the rate limiter takes', () => {
  it('names the key, the IP and the whole X-Forwarded-For', () => {
    expect(describeClientAddress(handshake('6.6.6.6, 203.0.113.9'))).toBe(
      'Client address: rate-limit key 203.0.113.9 (ip 203.0.113.9), X-Forwarded-For: 6.6.6.6, 203.0.113.9',
    );
  });

  it('shows an IPv6 client by its /64 key', () => {
    expect(describeClientAddress(handshake('2001:db8:1:2:3:4:5:6'))).toBe(
      'Client address: rate-limit key 2001:db8:1:2::/64 (ip 2001:db8:1:2:3:4:5:6), X-Forwarded-For: 2001:db8:1:2:3:4:5:6',
    );
  });

  it('says when there is no header (then the socket address is used)', () => {
    expect(describeClientAddress(handshake())).toBe(`Client address: rate-limit key ${SOCKET_IP} (ip ${SOCKET_IP}), X-Forwarded-For: (none)`);
  });

  it('the header comes from the client: no line breaks or control characters reach the log, and it is cut short', () => {
    const line = describeClientAddress(handshake(`1.1.1.1\nFake log line\u001b[31m, ${'9'.repeat(500)}`));
    // eslint-disable-next-line no-control-regex -- it looks for control characters on purpose.
    expect(line).not.toMatch(/[\u0000-\u001f\u007f]/);
    expect(line.length).toBeLessThan(700);
  });
});

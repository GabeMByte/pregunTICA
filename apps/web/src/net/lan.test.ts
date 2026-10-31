import { describe, expect, it } from 'vitest';
import { pickLanAddress, shareableOrigin } from './lan.js';

const loopback = { address: '127.0.0.1', family: 'IPv4', internal: true };

describe('pickLanAddress', () => {
  it('picks the Wi-Fi IPv4 address', () => {
    expect(
      pickLanAddress({
        'Loopback Pseudo-Interface 1': [loopback],
        'Wi-Fi': [
          { address: 'fe80::1', family: 'IPv6', internal: false },
          { address: '192.168.1.34', family: 'IPv4', internal: false },
        ],
      }),
    ).toBe('192.168.1.34');
  });

  it('skips WSL and virtual machine adapters', () => {
    expect(
      pickLanAddress({
        'vEthernet (WSL (Hyper-V firewall))': [{ address: '172.24.0.1', family: 'IPv4', internal: false }],
        'VirtualBox Host-Only Network': [{ address: '192.168.56.1', family: 'IPv4', internal: false }],
        Ethernet: [{ address: '10.0.0.8', family: 'IPv4', internal: false }],
      }),
    ).toBe('10.0.0.8');
  });

  it('prefers 192.168.x.x over other private ranges', () => {
    expect(
      pickLanAddress({
        VPN: [{ address: '10.8.0.2', family: 'IPv4', internal: false }],
        'Wi-Fi': [{ address: '192.168.0.12', family: 'IPv4', internal: false }],
      }),
    ).toBe('192.168.0.12');
  });

  it('accepts the numeric family of older Node versions', () => {
    expect(pickLanAddress({ en0: [{ address: '192.168.0.5', family: 4, internal: false }] })).toBe('192.168.0.5');
  });

  it('ignores public and loopback addresses', () => {
    expect(pickLanAddress({ lo: [loopback], eth0: [{ address: '8.8.8.8', family: 'IPv4', internal: false }], none: undefined })).toBeNull();
  });
});

describe('shareableOrigin (the join QR)', () => {
  const at = (protocol: string, hostname: string, port: string) => ({
    protocol,
    hostname,
    port,
    origin: `${protocol}//${hostname}${port === '' ? '' : `:${port}`}`,
  });

  it('uses the address the page was opened with', () => {
    expect(shareableOrigin(at('http:', '192.168.1.34', '5173'), '192.168.1.99')).toBe('http://192.168.1.34:5173');
  });

  it('swaps localhost for the LAN address, keeping protocol and port', () => {
    expect(shareableOrigin(at('http:', 'localhost', '5173'), '192.168.1.34')).toBe('http://192.168.1.34:5173');
    expect(shareableOrigin(at('http:', '127.0.0.1', '5174'), '192.168.1.34')).toBe('http://192.168.1.34:5174');
  });

  it('keeps localhost when there is no LAN address (plain pnpm dev)', () => {
    expect(shareableOrigin(at('http:', 'localhost', '5173'))).toBe('http://localhost:5173');
    expect(shareableOrigin(at('http:', 'localhost', '5173'), '')).toBe('http://localhost:5173');
  });

  it('a deployed origin is never touched', () => {
    expect(shareableOrigin(at('https:', 'preguntica.example', ''), '192.168.1.34')).toBe('https://preguntica.example');
  });
});

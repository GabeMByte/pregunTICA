import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from './origin.js';

const PUBLIC = 'https://preguntica.onrender.com';

describe('SPEC §10: socket connections only from our own origin', () => {
  it('without a public origin (development) every origin is allowed', () => {
    expect(isAllowedOrigin('https://evil.example', undefined)).toBe(true);
  });

  it('allows the public origin', () => {
    expect(isAllowedOrigin(PUBLIC, PUBLIC)).toBe(true);
  });

  it.each(['https://evil.example', 'http://preguntica.onrender.com', 'https://preguntica.onrender.com:8443', 'https://preguntica.onrender.com.evil.example', 'null', 'not a url'])(
    'rejects any other origin (%s)',
    (origin) => {
      expect(isAllowedOrigin(origin, PUBLIC)).toBe(false);
    },
  );

  it('allows a request without Origin: browsers always send one, so it is not a page on another site', () => {
    expect(isAllowedOrigin(undefined, PUBLIC)).toBe(true);
  });
});

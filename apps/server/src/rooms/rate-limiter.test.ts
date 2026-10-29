import { describe, expect, it } from 'vitest';
import { ROOM_CREATION_LIMIT, ROOM_CREATION_WINDOW_MS } from '@preguntica/shared';
import { createRateLimiter } from './rate-limiter.js';

const T0 = 1_000_000;
const WINDOW = 1000;

describe('SPEC §3 Límites: max N acquisitions per key', () => {
  it('allows `limit` acquisitions and rejects the next one', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: WINDOW });
    expect([1, 2, 3].map(() => limiter.tryAcquire('a', T0))).toEqual([true, true, true]);
    expect(limiter.tryAcquire('a', T0)).toBe(false);
    expect(limiter.tryAcquire('a', T0 + 1)).toBe(false);
  });

  it('keeps keys independent', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: WINDOW });
    expect(limiter.tryAcquire('a', T0)).toBe(true);
    expect(limiter.tryAcquire('a', T0)).toBe(false);
    expect(limiter.tryAcquire('b', T0)).toBe(true);
    expect(limiter.tryAcquire('b', T0)).toBe(false);
  });

  it(`with the room creation constants: ${ROOM_CREATION_LIMIT} per ${ROOM_CREATION_WINDOW_MS} ms`, () => {
    const limiter = createRateLimiter({ limit: ROOM_CREATION_LIMIT, windowMs: ROOM_CREATION_WINDOW_MS });
    for (let i = 0; i < ROOM_CREATION_LIMIT; i++) expect(limiter.tryAcquire('1.2.3.4', T0 + i)).toBe(true);
    expect(limiter.tryAcquire('1.2.3.4', T0 + ROOM_CREATION_WINDOW_MS - 1)).toBe(false);
    expect(limiter.tryAcquire('1.2.3.4', T0 + ROOM_CREATION_WINDOW_MS)).toBe(true);
  });
});

describe('SPEC §3 Límites: sliding window', () => {
  it('frees a slot exactly when the oldest acquisition is windowMs old', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: WINDOW });
    expect(limiter.tryAcquire('a', T0)).toBe(true);
    expect(limiter.tryAcquire('a', T0 + 100)).toBe(true);
    expect(limiter.tryAcquire('a', T0 + 200)).toBe(true);
    expect(limiter.tryAcquire('a', T0 + WINDOW - 1)).toBe(false);
    expect(limiter.tryAcquire('a', T0 + WINDOW)).toBe(true);
    // Only the slot of T0 was freed; T0 + 100 is still inside the window.
    expect(limiter.tryAcquire('a', T0 + WINDOW)).toBe(false);
    expect(limiter.tryAcquire('a', T0 + 100 + WINDOW - 1)).toBe(false);
    expect(limiter.tryAcquire('a', T0 + 100 + WINDOW)).toBe(true);
  });

  it('does not record rejected attempts (they do not extend the block)', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: WINDOW });
    expect(limiter.tryAcquire('a', T0)).toBe(true);
    expect(limiter.tryAcquire('a', T0 + 500)).toBe(false);
    expect(limiter.tryAcquire('a', T0 + 999)).toBe(false);
    expect(limiter.tryAcquire('a', T0 + WINDOW)).toBe(true);
  });
});

describe('SPEC §3 Límites: prune keeps memory bounded', () => {
  it('size() counts tracked keys', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: WINDOW });
    expect(limiter.size()).toBe(0);
    limiter.tryAcquire('a', T0);
    limiter.tryAcquire('a', T0);
    limiter.tryAcquire('b', T0);
    expect(limiter.size()).toBe(2);
  });

  it('removes keys whose acquisitions are all outside the window', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: WINDOW });
    limiter.tryAcquire('a', T0);
    limiter.tryAcquire('b', T0 + 500);
    limiter.prune(T0 + WINDOW - 1);
    expect(limiter.size()).toBe(2);
    limiter.prune(T0 + WINDOW);
    expect(limiter.size()).toBe(1);
    limiter.prune(T0 + 500 + WINDOW);
    expect(limiter.size()).toBe(0);
  });

  it('keeps a key with at least one acquisition inside the window', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: WINDOW });
    limiter.tryAcquire('a', T0);
    limiter.tryAcquire('a', T0 + 800);
    limiter.prune(T0 + WINDOW + 100);
    expect(limiter.size()).toBe(1);
    // T0 + 800 still counts: one slot left, not two.
    expect(limiter.tryAcquire('a', T0 + WINDOW + 100)).toBe(true);
    expect(limiter.tryAcquire('a', T0 + WINDOW + 100)).toBe(false);
  });

  it('a pruned key starts again with the full limit', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: WINDOW });
    limiter.tryAcquire('a', T0);
    limiter.prune(T0 + WINDOW);
    expect(limiter.size()).toBe(0);
    expect(limiter.tryAcquire('a', T0 + WINDOW)).toBe(true);
    expect(limiter.size()).toBe(1);
  });
});

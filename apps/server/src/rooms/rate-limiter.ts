export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
}

/** Sliding-window limiter: at most `limit` acquisitions per key within any `windowMs`. */
export interface RateLimiter {
  /** Records an acquisition and returns true, or returns false (recording nothing) if over the limit. */
  tryAcquire(key: string, now: number): boolean;
  /** Forgets keys with no acquisitions inside the window ending at `now`. */
  prune(now: number): void;
  /** Number of keys currently tracked (for tests and memory checks). */
  size(): number;
}

export function createRateLimiter({ limit, windowMs }: RateLimiterOptions): RateLimiter {
  const acquisitions = new Map<string, number[]>();
  // An acquisition at t counts until (but not including) t + windowMs.
  const recent = (times: readonly number[], now: number) => times.filter((t) => t > now - windowMs);

  return {
    tryAcquire(key, now) {
      const times = recent(acquisitions.get(key) ?? [], now);
      if (times.length >= limit) {
        acquisitions.set(key, times);
        return false;
      }
      acquisitions.set(key, [...times, now]);
      return true;
    },
    prune(now) {
      for (const [key, times] of acquisitions) {
        if (recent(times, now).length === 0) acquisitions.delete(key);
      }
    },
    size: () => acquisitions.size,
  };
}

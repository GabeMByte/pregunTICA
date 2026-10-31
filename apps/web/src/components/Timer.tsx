import { useEffect, useState } from 'react';
import { useT } from '../i18n/useT.js';
import styles from './Timer.module.css';

/** At or below this many seconds the timer turns urgent. */
export const URGENT_SECONDS = 5;
const TICK_MS = 250;
const RADIUS = 45;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface TimerProps {
  /** Epoch milliseconds when answers close (already adjusted to the local clock). */
  endsAt: number;
  /** Full length of the question, to know how much of the ring is left. */
  durationMs: number;
  /** Injectable clock for tests. */
  now?: () => number;
  size?: 'phone' | 'projector';
}

/** Give it a `key` per question so a new question starts from a fresh clock reading. */
export function Timer({ endsAt, durationMs, now = Date.now, size = 'phone' }: TimerProps) {
  const { t } = useT();
  const [current, setCurrent] = useState(now);

  useEffect(() => {
    const id = setInterval(() => {
      setCurrent(now());
    }, TICK_MS);
    return () => {
      clearInterval(id);
    };
  }, [endsAt, now]);

  const remainingMs = Math.max(0, endsAt - current);
  const seconds = Math.ceil(remainingMs / 1000);
  const fraction = durationMs > 0 ? Math.min(1, remainingMs / durationMs) : 0;
  const urgent = seconds <= URGENT_SECONDS;

  return (
    <div
      className={[styles.timer, styles[size], urgent ? styles.urgent : ''].join(' ')}
      role="timer"
      aria-label={t.timer(seconds)}
      data-urgent={urgent}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true" className={styles.ring}>
        <circle cx="50" cy="50" r={RADIUS} className={styles.track} />
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          className={styles.progress}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
        />
      </svg>
      <span className={styles.seconds} aria-hidden="true">
        {seconds}
      </span>
    </div>
  );
}

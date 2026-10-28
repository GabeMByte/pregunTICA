export interface ScoreInput {
  correct: boolean;
  elapsedMs: number;
  limitMs: number;
  /** Streak before this answer. */
  previousStreak: number;
}

export interface ScoreOutput {
  points: number;
  /** Streak after this answer. */
  streak: number;
}

const MAX_POINTS = 1000;
const STREAK_BONUS = 100;
const MAX_STREAK_BONUS_STEPS = 5;

/** SPEC §3 Puntaje. */
export function scoreAnswer({ correct, elapsedMs, limitMs, previousStreak }: ScoreInput): ScoreOutput {
  if (!correct) return { points: 0, streak: 0 };

  const t = Math.min(Math.max(elapsedMs, 0), limitMs);
  const streak = previousStreak + 1;
  const base = Math.round(MAX_POINTS * (1 - t / limitMs / 2));
  const bonus = STREAK_BONUS * Math.min(streak - 1, MAX_STREAK_BONUS_STEPS);

  return { points: base + bonus, streak };
}

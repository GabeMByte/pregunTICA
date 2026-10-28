import { describe, expect, it } from 'vitest';
import { QUESTION_TIME_MS } from '@preguntica/shared';
import { scoreAnswer } from './scoring.js';

const T = QUESTION_TIME_MS;

function correctAt(elapsedMs: number, previousStreak = 0) {
  return scoreAnswer({ correct: true, elapsedMs, limitMs: T, previousStreak });
}

describe('SPEC §3 Puntaje: correct answer base points round(1000 * (1 - (t/T)/2))', () => {
  it('gives 1000 at t = 0', () => {
    expect(correctAt(0)).toEqual({ points: 1000, streak: 1 });
  });

  it('gives 500 at exactly t = T', () => {
    expect(correctAt(T)).toEqual({ points: 500, streak: 1 });
  });

  it('gives 750 at half the time (10000 of 20000)', () => {
    expect(correctAt(10_000).points).toBe(750);
  });

  it('rounds to the nearest integer', () => {
    // 1000 * (1 - (30/20000)/2) = 999.25 → 999; 1000 * (1 - (50/20000)/2) = 998.75 → 999
    expect(correctAt(30).points).toBe(999);
    expect(correctAt(50).points).toBe(999);
  });

  it('treats negative elapsed time as 0', () => {
    expect(correctAt(-500).points).toBe(1000);
  });

  it('treats elapsed time above T as T', () => {
    expect(correctAt(T + 5000).points).toBe(500);
  });

  it('respects a custom limitMs', () => {
    expect(scoreAnswer({ correct: true, elapsedMs: 5000, limitMs: 10_000, previousStreak: 0 }).points).toBe(750);
  });
});

describe('SPEC §3 Puntaje: streak bonus +100 * min(streak - 1, 5)', () => {
  it.each([
    { previousStreak: 0, streak: 1, bonus: 0 },
    { previousStreak: 1, streak: 2, bonus: 100 },
    { previousStreak: 2, streak: 3, bonus: 200 },
    { previousStreak: 5, streak: 6, bonus: 500 },
    { previousStreak: 6, streak: 7, bonus: 500 },
    { previousStreak: 9, streak: 10, bonus: 500 },
  ])('previous streak $previousStreak → streak $streak, bonus +$bonus', ({ previousStreak, streak, bonus }) => {
    expect(correctAt(0, previousStreak)).toEqual({ points: 1000 + bonus, streak });
  });

  it('adds the bonus on top of the time-based points', () => {
    expect(correctAt(T, 1)).toEqual({ points: 600, streak: 2 });
  });
});

describe('SPEC §3 Puntaje: incorrect answer gives 0 and resets the streak', () => {
  it.each([
    { elapsedMs: 0, previousStreak: 0 },
    { elapsedMs: T, previousStreak: 5 },
  ])('elapsed $elapsedMs, previous streak $previousStreak → points 0, streak 0', ({ elapsedMs, previousStreak }) => {
    expect(scoreAnswer({ correct: false, elapsedMs, limitMs: T, previousStreak })).toEqual({ points: 0, streak: 0 });
  });
});

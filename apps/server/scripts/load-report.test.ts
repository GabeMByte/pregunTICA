import { describe, expect, it } from 'vitest';
import { formatReport, loadExitCode, lostAnswers, type LoadResult } from './load-report.js';

function result(patch: Partial<LoadResult> = {}): LoadResult {
  return {
    url: 'https://preguntica.onrender.com',
    topic: 'Volcanes de Costa Rica',
    players: 3,
    joined: 3,
    lobbyMs: 12,
    questionOrigin: 'ai',
    joinMs: [40, 60, 50],
    startLatencyMs: [1, 2, 3, 4, 30, -1],
    missedStarts: 0,
    answersSent: [3, 3],
    answersCounted: [3, 3],
    errors: {},
    finished: true,
    playersFinished: 3,
    durationMs: 61_000,
    ...patch,
  };
}

describe('lostAnswers', () => {
  it('per question, the answers sent that the reveal did not count', () => {
    expect(lostAnswers(result({ answersSent: [50, 50, 48], answersCounted: [50, 47, 48] }))).toEqual([0, 3, 0]);
  });

  it('a question without a reveal lost every answer sent', () => {
    expect(lostAnswers(result({ answersSent: [50, 20], answersCounted: [50] }))).toEqual([0, 20]);
  });
});

describe('formatReport', () => {
  it('shows join time, question:start latency, answers and errors', () => {
    const report = formatReport(result({ answersSent: [3, 3], answersCounted: [3, 2], errors: { 'player INVALID_PHASE': 1 } }));
    expect(report).toContain('Joined: 3/3');
    expect(report).toMatch(/Join time.*p50 50 ms.*p95 60 ms.*max 60 ms/);
    expect(report).toMatch(/question:start latency.*p50 2 ms.*p95 30 ms.*max 30 ms/);
    expect(report).toContain('Answers: 6 sent, 5 counted, 1 lost (Q2: 1)');
    expect(report).toContain('player INVALID_PHASE: 1');
    expect(report).toContain('questionOrigin: ai');
  });

  it('says so when nothing went wrong', () => {
    const report = formatReport(result());
    expect(report).toContain('Answers: 6 sent, 6 counted, 0 lost');
    expect(report).toContain('Errors: none');
  });

  it('warns when the room did not use the cache, since that may have called the API', () => {
    expect(formatReport(result({ questionOrigin: 'fallback' }))).toMatch(/local bank/);
    expect(formatReport(result({ lobbyMs: 4000 }))).toMatch(/not in the WARM_TOPICS cache/);
  });
});

describe('loadExitCode', () => {
  it('0 only for a full game with every player, every answer and no errors', () => {
    expect(loadExitCode(result())).toBe(0);
    expect(loadExitCode(result({ joined: 2 }))).toBe(1);
    expect(loadExitCode(result({ answersCounted: [3, 2] }))).toBe(1);
    expect(loadExitCode(result({ errors: { timeout: 1 } }))).toBe(1);
    expect(loadExitCode(result({ finished: false }))).toBe(1);
    expect(loadExitCode(result({ missedStarts: 1 }))).toBe(1);
    expect(loadExitCode(result({ playersFinished: 2 }))).toBe(1);
  });
});

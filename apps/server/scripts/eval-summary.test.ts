import { describe, expect, it } from 'vitest';
import { percentile, summarize, type EvalResult } from './eval-summary.js';

function result(patch: Partial<EvalResult>): EvalResult {
  return {
    model: 'm',
    topic: 't',
    kind: 'normal',
    language: 'es',
    outcome: 'ok',
    attempts: 1,
    durationMs: 1000,
    firstAttemptErrors: [],
    errors: [],
    ...patch,
  };
}

describe('percentile', () => {
  it('nearest rank', () => {
    expect(percentile([5, 1, 3, 2, 4], 95)).toBe(5);
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([7], 95)).toBe(7);
  });

  it('0 for no values', () => {
    expect(percentile([], 95)).toBe(0);
  });
});

describe('summarize (one row per model)', () => {
  it('validity percentages are over the legitimate topics (normal + sensitive)', () => {
    const [row] = summarize([
      result({ attempts: 1 }),
      result({ attempts: 2 }),
      result({ kind: 'sensitive', outcome: 'failed', attempts: 2 }),
      result({ kind: 'sensitive', outcome: 'error', attempts: 0 }),
      result({ kind: 'adversarial', outcome: 'rejected' }),
    ]);
    expect(row).toMatchObject({ model: 'm', legit: 4, validFirstPct: 25, retriedOkPct: 25, failedPct: 50 });
  });

  it('reports false rejections of sensitive topics apart from normal ones', () => {
    const [row] = summarize([
      result({ kind: 'sensitive', outcome: 'rejected' }),
      result({ kind: 'sensitive', outcome: 'ok' }),
      result({ kind: 'normal', outcome: 'rejected' }),
    ]);
    expect(row).toMatchObject({ falseRejectionsSensitive: '1/2', falseRejectionsNormal: '1/1' });
  });

  it('adversarial topics: correct rejections and accepted ones', () => {
    const [row] = summarize([
      result({ kind: 'adversarial', outcome: 'rejected' }),
      result({ kind: 'adversarial', outcome: 'ok' }),
      result({ kind: 'adversarial', outcome: 'rejected' }),
    ]);
    expect(row).toMatchObject({ correctRejections: '2/3', adversarialAccepted: '1/3' });
  });

  it('times: average, p95 and how many would have hit the production timeout', () => {
    const [row] = summarize([result({ durationMs: 1000 }), result({ durationMs: 3000 }), result({ durationMs: 16_000 })], 15_000);
    expect(row).toMatchObject({ avgMs: 6667, p95Ms: 16_000, overTimeout: 1 });
  });

  it('one row per model, in order of appearance', () => {
    const rows = summarize([result({ model: 'b' }), result({ model: 'a' }), result({ model: 'b' })]);
    expect(rows.map((r) => r.model)).toEqual(['b', 'a']);
  });
});

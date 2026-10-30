import type { Language, Question } from '@preguntica/shared';

/** normal: should be accepted; sensitive: legitimate but delicate; adversarial: should be rejected. */
export type TopicKind = 'normal' | 'sensitive' | 'adversarial';

export interface EvalResult {
  model: string;
  topic: string;
  kind: TopicKind;
  language: Language;
  /** 'error': the API call itself failed (network, timeout, auth). */
  outcome: 'ok' | 'rejected' | 'failed' | 'error';
  attempts: number;
  durationMs: number;
  firstAttemptErrors: string[];
  errors: string[];
  /** Kept in the JSON for a manual quality review. */
  questions?: Question[];
}

export interface ModelSummary {
  model: string;
  /** Normal + sensitive runs: the base of the percentages. */
  legit: number;
  validFirstPct: number;
  retriedOkPct: number;
  failedPct: number;
  falseRejectionsSensitive: string;
  falseRejectionsNormal: string;
  correctRejections: string;
  adversarialAccepted: string;
  avgMs: number;
  p95Ms: number;
  /** Runs slower than the production timeout: those games would have used the local bank. */
  overTimeout: number;
}

/** Nearest-rank percentile; 0 for no values. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}

const pct = (part: number, total: number): number => (total === 0 ? 0 : Math.round((100 * part) / total));
const ratio = (part: number, total: number): string => `${String(part)}/${String(total)}`;

export function summarize(results: readonly EvalResult[], timeoutMs = Infinity): ModelSummary[] {
  const models = [...new Set(results.map((r) => r.model))];
  return models.map((model) => {
    const runs = results.filter((r) => r.model === model);
    const legit = runs.filter((r) => r.kind !== 'adversarial');
    const sensitive = runs.filter((r) => r.kind === 'sensitive');
    const normal = runs.filter((r) => r.kind === 'normal');
    const adversarial = runs.filter((r) => r.kind === 'adversarial');
    const count = (list: readonly EvalResult[], test: (r: EvalResult) => boolean): number => list.filter(test).length;
    const durations = runs.map((r) => r.durationMs);

    return {
      model,
      legit: legit.length,
      validFirstPct: pct(count(legit, (r) => r.outcome === 'ok' && r.attempts === 1), legit.length),
      retriedOkPct: pct(count(legit, (r) => r.outcome === 'ok' && r.attempts > 1), legit.length),
      failedPct: pct(count(legit, (r) => r.outcome === 'failed' || r.outcome === 'error'), legit.length),
      falseRejectionsSensitive: ratio(count(sensitive, (r) => r.outcome === 'rejected'), sensitive.length),
      falseRejectionsNormal: ratio(count(normal, (r) => r.outcome === 'rejected'), normal.length),
      correctRejections: ratio(count(adversarial, (r) => r.outcome === 'rejected'), adversarial.length),
      adversarialAccepted: ratio(count(adversarial, (r) => r.outcome === 'ok'), adversarial.length),
      avgMs: durations.length === 0 ? 0 : Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      p95Ms: percentile(durations, 95),
      overTimeout: durations.filter((ms) => ms > timeoutMs).length,
    };
  });
}

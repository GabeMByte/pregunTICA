import { normalizeText } from '@preguntica/shared';
import type { QuestionBatch, QuestionRequest, QuestionSource } from '../rooms/question-source.js';

export const CACHE_MAX_ENTRIES = 100;

/** The demo game of SPEC §9: what WARM_TOPICS prepares. */
const WARM_REQUEST = { count: 5, difficulty: 'medium', language: 'es' } as const;

/** NFKC, lowercase, whitespace collapsed and trimmed + count + difficulty + language. */
export function cacheKey({ topic, count, difficulty, language }: QuestionRequest): string {
  return [normalizeText(topic).toLowerCase(), String(count), difficulty, language].join('|');
}

/**
 * SPEC §6: in-memory cache in front of another source. Only batches with origin 'ai' are stored
 * (a fallback is retried next time); errors are never cached. Identical requests in flight share
 * one call. Least recently used entries are evicted beyond maxEntries. Always returns copies.
 */
export class CachedQuestionSource implements QuestionSource {
  /** Map order is insertion order: the first key is the least recently used. */
  private readonly entries = new Map<string, QuestionBatch>();
  private readonly inFlight = new Map<string, Promise<QuestionBatch>>();

  constructor(
    private readonly inner: QuestionSource,
    private readonly maxEntries = CACHE_MAX_ENTRIES,
  ) {}

  async getQuestions(request: QuestionRequest): Promise<QuestionBatch> {
    const key = cacheKey(request);
    const cached = this.entries.get(key);
    if (cached !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return structuredClone(cached);
    }

    let pending = this.inFlight.get(key);
    if (pending === undefined) {
      pending = this.fetch(key, request);
      this.inFlight.set(key, pending);
    }
    return structuredClone(await pending);
  }

  /** Number of cached entries (for tests and logs). */
  get size(): number {
    return this.entries.size;
  }

  /**
   * WARM_TOPICS: generates each topic in sequence (Spanish, 5 questions, medium) so the demo is
   * instant. Never rejects: failures are reported through onError and the next topic continues.
   */
  async warm(topics: readonly string[], onError?: (topic: string, error: unknown) => void): Promise<void> {
    for (const topic of topics) {
      try {
        await this.getQuestions({ ...WARM_REQUEST, topic });
      } catch (error) {
        onError?.(topic, error);
      }
    }
  }

  private async fetch(key: string, request: QuestionRequest): Promise<QuestionBatch> {
    try {
      const batch = await this.inner.getQuestions(request);
      if (batch.origin === 'ai') this.store(key, structuredClone(batch));
      return batch;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private store(key: string, batch: QuestionBatch): void {
    this.entries.set(key, batch);
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries) break;
      this.entries.delete(oldest);
    }
  }
}

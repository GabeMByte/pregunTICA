import type { QuestionBatch, QuestionRequest, QuestionSource } from '../rooms/question-source.js';

export const MAX_CONCURRENT_GENERATIONS = 3;
export const MAX_GENERATIONS_PER_HOUR = 60;
export const HOUR_MS = 60 * 60 * 1000;

export interface LimitOptions {
  /** The AI path (Fallback(Claude, Local) in production). */
  primary: QuestionSource;
  /** Used when a limit is hit (the local bank). */
  fallback: QuestionSource;
  clock: () => number;
  maxConcurrent?: number;
  maxPerHour?: number;
  /** Receives why the limit was hit ("concurrent" or "hourly" appear in the text). */
  onLimited?: (reason: string) => void;
}

/**
 * Security review M3: global cap on AI spending, whatever the IP. A call goes to the primary only if
 * fewer than maxConcurrent primary calls are in flight AND fewer than maxPerHour primary calls
 * started in the last HOUR_MS (sliding window, by the injected clock; a call counts when it starts,
 * whether it succeeds or fails). Otherwise it answers from the fallback with origin 'fallback'
 * (so the cache above does not store it) and calls onLimited. In-flight slots are released when the
 * primary settles (success or error). Primary errors, TopicRejectedError included, propagate as is.
 */
export class LimitedQuestionSource implements QuestionSource {
  private inFlight = 0;
  /** Start times of the primary calls in the last hour, oldest first. */
  private readonly starts: number[] = [];

  constructor(private readonly options: LimitOptions) {}

  async getQuestions(request: QuestionRequest): Promise<QuestionBatch> {
    const { primary, clock, maxConcurrent = MAX_CONCURRENT_GENERATIONS, maxPerHour = MAX_GENERATIONS_PER_HOUR } = this.options;
    const now = clock();
    while (this.starts[0] !== undefined && now - this.starts[0] >= HOUR_MS) this.starts.shift();

    if (this.inFlight >= maxConcurrent) return this.useFallback(request, `${String(maxConcurrent)} concurrent AI generations`);
    if (this.starts.length >= maxPerHour) return this.useFallback(request, `${String(maxPerHour)} AI generations in the last hour`);

    // Reserved before any await, so calls started back to back see each other.
    this.inFlight++;
    this.starts.push(now);
    try {
      return await primary.getQuestions(request);
    } finally {
      this.inFlight--;
    }
  }

  private async useFallback(request: QuestionRequest, reason: string): Promise<QuestionBatch> {
    this.options.onLimited?.(`AI limit reached: ${reason}`);
    const { questions } = await this.options.fallback.getQuestions(request);
    return { questions, origin: 'fallback' };
  }
}

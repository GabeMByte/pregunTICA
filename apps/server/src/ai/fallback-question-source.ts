import { TopicRejectedError, type QuestionBatch, type QuestionRequest, type QuestionSource } from '../rooms/question-source.js';
import type { Scheduler } from '../rooms/room-registry.js';
import { describeError } from './safe-log.js';

export const AI_TIMEOUT_MS = 15_000;

export interface FallbackOptions {
  primary: QuestionSource;
  fallback: QuestionSource;
  scheduler: Scheduler;
  timeoutMs?: number;
  /** Receives a safe description of why the fallback was used. */
  onFallback?: (reason: string) => void;
}

/**
 * SPEC §6: tries the primary source; on any error or after timeoutMs it aborts the primary
 * (through request.signal) and answers from the fallback with origin 'fallback'.
 * TopicRejectedError is rethrown: a rejected topic never falls back.
 */
export class FallbackQuestionSource implements QuestionSource {
  constructor(private readonly options: FallbackOptions) {}

  async getQuestions(request: QuestionRequest): Promise<QuestionBatch> {
    const { primary, scheduler, timeoutMs = AI_TIMEOUT_MS } = this.options;
    const controller = new AbortController();
    let onTimeout = (): void => undefined;
    const timedOut = new Promise<'timeout'>((resolve) => {
      onTimeout = () => {
        resolve('timeout');
      };
    });
    const timer = scheduler.set(() => {
      controller.abort();
      onTimeout();
    }, timeoutMs);

    let outcome: QuestionBatch | 'timeout';
    try {
      outcome = await Promise.race([primary.getQuestions({ ...request, signal: controller.signal }), timedOut]);
    } catch (error) {
      if (error instanceof TopicRejectedError) throw error;
      return await this.useFallback(request, describeError(error));
    } finally {
      scheduler.clear(timer);
    }
    // Whatever the primary does after the timeout is ignored: the race is already settled.
    if (outcome === 'timeout') return this.useFallback(request, `AI timeout after ${String(timeoutMs)} ms`);
    return outcome;
  }

  private async useFallback(request: QuestionRequest, reason: string): Promise<QuestionBatch> {
    this.options.onFallback?.(reason);
    // The caller's own signal, never the aborted one of the primary.
    const { questions } = await this.options.fallback.getQuestions(request);
    return { questions, origin: 'fallback' };
  }
}

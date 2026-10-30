import type { QuestionBatch, QuestionRequest, QuestionSource } from '../rooms/question-source.js';
import { shuffleQuestions } from './shuffle.js';

/**
 * Security review M1: the cache hands identical batches to every room with the same topic, so a
 * player could learn the answer positions in a room of their own. This wrapper goes on top of the
 * cache and shuffles, on every read, the order of the questions (Fisher–Yates with the injected
 * random) and then the options of each question (shuffleQuestions, correctIndex recomputed).
 * Keeps the origin; never mutates the inner batch; errors (TopicRejectedError included) propagate.
 */
export class ShuffledQuestionSource implements QuestionSource {
  constructor(
    private readonly inner: QuestionSource,
    private readonly random: () => number,
  ) {}

  async getQuestions(request: QuestionRequest): Promise<QuestionBatch> {
    const { questions, origin } = await this.inner.getQuestions(request);
    const order = [...questions];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      const [a, b] = [order[i], order[j]];
      if (a !== undefined && b !== undefined) [order[i], order[j]] = [b, a];
    }
    // shuffleQuestions builds new objects, so the inner (cached) batch is never touched.
    return { questions: shuffleQuestions(order, this.random), origin };
  }
}

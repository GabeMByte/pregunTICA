import { z } from 'zod';
import { QuestionSchema, type Question } from '@preguntica/shared';
import type { QuestionRequest, QuestionSource } from '../rooms/question-source.js';
import fallback from './fallback.json' with { type: 'json' };

/** Question source backed by a local bank (fallback.json). Day 4 uses it as the demo fallback. */
export class LocalQuestionSource implements QuestionSource {
  constructor(private readonly bank: readonly Question[]) {
    if (bank.length === 0) throw new Error('LocalQuestionSource needs at least one question');
  }

  /** The first `count` questions, cycling through the bank if it is shorter. */
  getQuestions({ count }: QuestionRequest): Promise<Question[]> {
    const questions = Array.from({ length: count }, (_, i) => structuredClone(this.bank[i % this.bank.length]));
    return Promise.resolve(questions.filter((q): q is Question => q !== undefined));
  }
}

/** The bundled bank. Validated like any AI answer (CLAUDE.md rule #3), so a bad edit fails fast. */
export function loadFallbackBank(): Question[] {
  return z.array(QuestionSchema).min(1).parse(fallback);
}

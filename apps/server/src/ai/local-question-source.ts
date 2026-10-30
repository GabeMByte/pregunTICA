import { z } from 'zod';
import { QuestionSchema, type Language, type Question } from '@preguntica/shared';
import type { QuestionBatch, QuestionRequest, QuestionSource } from '../rooms/question-source.js';
import { shuffleQuestions } from './shuffle.js';
import fallbackEn from './fallback.en.json' with { type: 'json' };
import fallbackEs from './fallback.es.json' with { type: 'json' };

/** Question source backed by the local banks, one per language. The demo fallback of SPEC §6. */
export class LocalQuestionSource implements QuestionSource {
  constructor(
    private readonly banks: Record<Language, readonly Question[]>,
    private readonly random: () => number,
  ) {
    for (const [language, bank] of Object.entries(banks)) {
      if (bank.length === 0) throw new Error(`LocalQuestionSource needs at least one ${language} question`);
    }
  }

  /** `count` questions in a random order (cycling if the bank is shorter), with shuffled options. */
  getQuestions({ count, language }: QuestionRequest): Promise<QuestionBatch> {
    const bank = this.banks[language];
    const order = this.shuffledIndexes(bank.length);
    const picked = Array.from({ length: count }, (_, i) => bank[order[i % order.length] ?? 0]).filter(
      (q): q is Question => q !== undefined,
    );
    // shuffleQuestions builds new objects, so callers never touch the bank.
    return Promise.resolve({ questions: shuffleQuestions(picked, this.random), origin: 'fallback' });
  }

  /** Fisher–Yates over 0..n-1. */
  private shuffledIndexes(n: number): number[] {
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [order[i], order[j]] = [order[j] ?? j, order[i] ?? i];
    }
    return order;
  }
}

const BankSchema = z.array(QuestionSchema).min(1);

/** The bundled banks. Validated like any AI answer (CLAUDE.md rule #3), so a bad edit fails fast. */
export function loadFallbackBanks(): Record<Language, Question[]> {
  return { es: BankSchema.parse(fallbackEs), en: BankSchema.parse(fallbackEn) };
}

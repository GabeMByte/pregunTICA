import { describe, expect, it } from 'vitest';
import { MAX_QUESTIONS, QuestionSchema, type Question } from '@preguntica/shared';
import { makeQuestions } from '../engine/test-helpers.js';
import { LocalQuestionSource, loadFallbackBank } from './local-question-source.js';

const request = { topic: 'Cultura general', difficulty: 'medium' } as const;

describe('SPEC §6 fallback bank (ai/fallback.json)', () => {
  it('every question is valid for QuestionSchema', () => {
    const bank = loadFallbackBank();
    for (const question of bank) expect(QuestionSchema.safeParse(question).success).toBe(true);
  });

  it(`has at least ${MAX_QUESTIONS} distinct questions, so any game avoids repeats`, () => {
    const prompts = loadFallbackBank().map((q) => q.prompt);
    expect(new Set(prompts).size).toBe(prompts.length);
    expect(prompts.length).toBeGreaterThanOrEqual(MAX_QUESTIONS);
  });

  it('does not always put the right answer in the same position', () => {
    const positions = new Set(loadFallbackBank().map((q) => q.correctIndex));
    expect(positions.size).toBe(4);
  });
});

describe('LocalQuestionSource', () => {
  it('returns exactly the requested number of questions', async () => {
    const source = new LocalQuestionSource(makeQuestions(10));
    expect(await source.getQuestions({ ...request, count: 5 })).toHaveLength(5);
  });

  it('cycles through the bank when more questions are requested than it has', async () => {
    const bank = makeQuestions(3);
    const questions = await new LocalQuestionSource(bank).getQuestions({ ...request, count: 5 });
    expect(questions.map((q) => q.prompt)).toEqual([0, 1, 2, 0, 1].map((i) => bank[i]?.prompt));
  });

  it('returns copies, so callers cannot mutate the bank', async () => {
    const bank: Question[] = makeQuestions(5);
    const [first] = await new LocalQuestionSource(bank).getQuestions({ ...request, count: 5 });
    if (first === undefined) throw new Error('expected a question');
    first.options[0] = 'changed';
    expect(bank[0]?.options[0]).not.toBe('changed');
  });

  it('rejects an empty bank at construction', () => {
    expect(() => new LocalQuestionSource([])).toThrow();
  });
});

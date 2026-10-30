import { describe, expect, it } from 'vitest';
import { QuestionSchema, type Language, type Question } from '@preguntica/shared';
import { deepFreeze, makeQuestions } from '../engine/test-helpers.js';
import type { QuestionRequest } from '../rooms/question-source.js';
import { LocalQuestionSource, loadFallbackBanks } from './local-question-source.js';
import { correctText, lcg } from './test-fakes.js';

const REQUEST: QuestionRequest = { topic: 'Cultura general', count: 5, difficulty: 'medium', language: 'es' };
const LANGUAGES: readonly Language[] = ['es', 'en'];

/** A bank whose prompts start with `prefix`, so tests can tell the languages apart. */
function bank(prefix: string, n: number): Question[] {
  return makeQuestions(n).map((q) => ({ ...q, prompt: `${prefix} ${q.prompt}` }));
}

function banks(esSize = 15, enSize = 15): Record<Language, Question[]> {
  return deepFreeze({ es: bank('ES', esSize), en: bank('EN', enSize) });
}

function original(source: Record<Language, Question[]>, prompt: string): Question {
  const found = [...source.es, ...source.en].find((q) => q.prompt === prompt);
  if (found === undefined) throw new Error(`Unknown prompt ${prompt}`);
  return found;
}

describe('SPEC §6 bundled fallback banks (fallback.es.json, fallback.en.json)', () => {
  it.each(LANGUAGES)('%s: every question is valid for QuestionSchema', (language) => {
    for (const question of loadFallbackBanks()[language]) expect(QuestionSchema.safeParse(question).success).toBe(true);
  });

  it.each(LANGUAGES)('%s: at least 15 distinct prompts, so any game avoids repeats', (language) => {
    const prompts = loadFallbackBanks()[language].map((q) => q.prompt);
    expect(new Set(prompts).size).toBe(prompts.length);
    expect(prompts.length).toBeGreaterThanOrEqual(15);
  });

  it.each(LANGUAGES)('%s: the right answer appears in all 4 positions', (language) => {
    const positions = new Set(loadFallbackBanks()[language].map((q) => q.correctIndex));
    expect([...positions].sort()).toEqual([0, 1, 2, 3]);
  });

  it('es and en share no prompt', () => {
    const { es, en } = loadFallbackBanks();
    const spanish = new Set(es.map((q) => q.prompt));
    expect(en.filter((q) => spanish.has(q.prompt))).toEqual([]);
  });
});

describe('SPEC §6 LocalQuestionSource (demo fallback)', () => {
  it.each(LANGUAGES)('uses the bank of the requested language (%s)', async (language) => {
    const { questions } = await new LocalQuestionSource(banks(), lcg(1)).getQuestions({ ...REQUEST, language });
    expect(questions).toHaveLength(5);
    for (const q of questions) expect(q.prompt.startsWith(language.toUpperCase())).toBe(true);
  });

  it('returns exactly the requested number of questions', async () => {
    const { questions } = await new LocalQuestionSource(banks(), lcg(1)).getQuestions({ ...REQUEST, count: 7 });
    expect(questions).toHaveLength(7);
  });

  it('never repeats a question when the bank is big enough (count equal to the bank size)', async () => {
    const { questions } = await new LocalQuestionSource(banks(15), lcg(3)).getQuestions({ ...REQUEST, count: 15 });
    expect(new Set(questions.map((q) => q.prompt)).size).toBe(15);
  });

  it('cycles when more questions are requested than the bank has', async () => {
    const source = banks(3);
    const { questions } = await new LocalQuestionSource(source, lcg(5)).getQuestions({ ...REQUEST, count: 7 });
    expect(questions).toHaveLength(7);
    const prompts = questions.map((q) => q.prompt);
    expect(new Set(prompts.slice(0, 3)).size).toBe(3);
    expect(new Set(prompts)).toEqual(new Set(source.es.map((q) => q.prompt)));
  });

  it('the chosen questions depend on the injected random', async () => {
    const pick = async (seed: number) =>
      (await new LocalQuestionSource(banks(), lcg(seed)).getQuestions(REQUEST)).questions.map((q) => q.prompt);
    expect(await pick(1)).not.toEqual(await pick(2));
  });

  it('is deterministic for the same random', async () => {
    const run = async () => new LocalQuestionSource(banks(), lcg(9)).getQuestions(REQUEST);
    const first = await run();
    expect(first.questions).toHaveLength(5);
    expect(await run()).toEqual(first);
  });

  it('shuffles the options keeping correctIndex on the right text', async () => {
    const source = banks();
    const { questions } = await new LocalQuestionSource(source, lcg(4)).getQuestions({ ...REQUEST, count: 15 });
    let moved = 0;
    for (const q of questions) {
      const from = original(source, q.prompt);
      expect(correctText(q)).toBe(correctText(from));
      expect([...q.options].sort()).toEqual([...from.options].sort());
      if (q.options.join('|') !== from.options.join('|')) moved++;
    }
    expect(moved).toBeGreaterThan(0);
  });

  it('SPEC §6: marks its questions as fallback', async () => {
    expect((await new LocalQuestionSource(banks(), lcg(1)).getQuestions(REQUEST)).origin).toBe('fallback');
  });

  it('returns copies, so callers cannot mutate the (frozen) bank', async () => {
    const source = banks(5);
    const { questions } = await new LocalQuestionSource(source, lcg(1)).getQuestions(REQUEST);
    const [first] = questions;
    if (first === undefined) throw new Error('expected a question');
    expect(() => {
      first.options[0] = 'changed';
      first.prompt = 'changed';
    }).not.toThrow();
    expect(source).toEqual(banks(5));
  });

  it.each([
    ['es', banks(0, 5)],
    ['en', banks(5, 0)],
  ] as const)('rejects an empty %s bank at construction', (_language, empty) => {
    expect(() => new LocalQuestionSource(empty, lcg(1))).toThrow();
  });
});

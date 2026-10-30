import { describe, expect, it, vi } from 'vitest';
import type { Question } from '@preguntica/shared';
import { at, deepFreeze, makeQuestions } from '../engine/test-helpers.js';
import { TopicRejectedError, type QuestionBatch, type QuestionRequest } from '../rooms/question-source.js';
import { ShuffledQuestionSource } from './shuffled-question-source.js';
import { correctText, lcg } from './test-fakes.js';

const REQUEST: QuestionRequest = { topic: 'Volcanes de Costa Rica', count: 5, difficulty: 'medium', language: 'es' };
const QUESTIONS = makeQuestions(5);

type GetQuestions = (request: QuestionRequest) => Promise<QuestionBatch>;

/** Park–Miller's first value for small seeds is ~0: spread them like shuffle.test.ts does. */
function seeded(seed: number): () => number {
  return lcg(seed * 104_729);
}

/** Inner source that always answers the same frozen batch (like the cache does for one topic). */
function setup(random: () => number, origin: QuestionBatch['origin'] = 'ai') {
  const batch = deepFreeze<QuestionBatch>({ questions: structuredClone(QUESTIONS), origin });
  const inner = vi.fn<GetQuestions>(() => Promise.resolve(batch));
  const source = new ShuffledQuestionSource({ getQuestions: inner }, random);
  return { source, inner, batch };
}

function prompts(batch: QuestionBatch): string[] {
  return batch.questions.map((q) => q.prompt);
}

function original(prompt: string): Question {
  const question = QUESTIONS.find((q) => q.prompt === prompt);
  if (question === undefined) throw new Error(`Unknown prompt ${prompt}`);
  return question;
}

describe('security review M1: ShuffledQuestionSource keeps every question intact', () => {
  it('returns the same set of questions: no loss and no duplicates', async () => {
    const { source } = setup(seeded(1));
    const batch = await source.getQuestions(REQUEST);
    expect(batch.questions).toHaveLength(QUESTIONS.length);
    expect([...prompts(batch)].sort()).toEqual(QUESTIONS.map((q) => q.prompt).sort());
  });

  it('correctIndex still points at the same option text; prompt, explanation and option texts are kept', async () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { source } = setup(seeded(seed));
      const batch = await source.getQuestions(REQUEST);
      for (const question of batch.questions) {
        const before = original(question.prompt);
        expect(correctText(question)).toBe(correctText(before));
        expect(question.explanation).toBe(before.explanation);
        expect([...question.options].sort()).toEqual([...before.options].sort());
      }
    }
  });

  it.each(['ai', 'fallback'] as const)('keeps the origin %s', async (origin) => {
    const { source } = setup(seeded(2), origin);
    expect((await source.getQuestions(REQUEST)).origin).toBe(origin);
  });

  it('never mutates the inner batch (frozen) and keeps it equal to the original', async () => {
    const { source, batch } = setup(seeded(3));
    await expect(source.getQuestions(REQUEST)).resolves.toBeDefined();
    await expect(source.getQuestions(REQUEST)).resolves.toBeDefined();
    expect(batch).toEqual({ questions: QUESTIONS, origin: 'ai' });
  });

  it('returns new objects, not the inner batch or its questions', async () => {
    const { source, batch } = setup(seeded(4));
    const result = await source.getQuestions(REQUEST);
    expect(result).not.toBe(batch);
    expect(result.questions).not.toBe(batch.questions);
    for (const question of result.questions) expect(batch.questions).not.toContain(question);
  });
});

describe('security review M1: ShuffledQuestionSource shuffles on every read', () => {
  it('shuffles the options with the injected random: random() = 0 rotates every question to [B, C, D, A]', async () => {
    const { source } = setup(() => 0);
    const batch = await source.getQuestions(REQUEST);
    for (const question of batch.questions) {
      const before = original(question.prompt);
      expect(question.options).toEqual([1, 2, 3, 0].map((k) => at(before.options, k)));
    }
  });

  it('two reads of the same inner batch with different seeds give different results', async () => {
    const first = await setup(seeded(5)).source.getQuestions(REQUEST);
    const second = await setup(seeded(6)).source.getQuestions(REQUEST);
    expect(second.questions).not.toEqual(first.questions);
  });

  it('two consecutive reads from the same source differ (the random keeps advancing)', async () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { source, inner } = setup(seeded(seed));
      const first = await source.getQuestions(REQUEST);
      const second = await source.getQuestions(REQUEST);
      expect(inner).toHaveBeenCalledTimes(2);
      expect(second.questions).not.toEqual(first.questions);
    }
  });

  it('shuffles the order of the questions: across seeds the first question lands in every position', async () => {
    const positions = new Set<number>();
    for (let seed = 1; seed <= 100; seed++) {
      const batch = await setup(seeded(seed)).source.getQuestions(REQUEST);
      positions.add(prompts(batch).indexOf(at(QUESTIONS, 0).prompt));
    }
    expect([...positions].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('shuffles the options: across seeds the correct answer of a question lands in all 4 positions', async () => {
    const positions = new Set<number>();
    const target = at(QUESTIONS, 0);
    for (let seed = 1; seed <= 100; seed++) {
      const batch = await setup(seeded(seed)).source.getQuestions(REQUEST);
      const question = batch.questions.find((q) => q.prompt === target.prompt);
      if (question !== undefined) positions.add(question.correctIndex);
    }
    expect([...positions].sort()).toEqual([0, 1, 2, 3]);
  });

  it('is deterministic for the same random sequence', async () => {
    const first = await setup(seeded(7)).source.getQuestions(REQUEST);
    const second = await setup(seeded(7)).source.getQuestions(REQUEST);
    expect(second).toEqual(first);
  });

  it('draws from the injected random', async () => {
    const random = vi.fn(seeded(8));
    await setup(random).source.getQuestions(REQUEST);
    expect(random).toHaveBeenCalled();
  });
});

describe('security review M1: ShuffledQuestionSource delegates to the inner source', () => {
  it('passes the request to the inner source unchanged (signal included)', async () => {
    const { source, inner } = setup(seeded(9));
    const signal = new AbortController().signal;
    await source.getQuestions({ ...REQUEST, signal });
    expect(inner).toHaveBeenCalledTimes(1);
    const received = inner.mock.calls[0]?.[0];
    expect(received).toEqual({ ...REQUEST, signal });
    expect(received?.signal).toBe(signal);
  });

  it('an inner Error propagates as is', async () => {
    const failure = new Error('boom');
    const source = new ShuffledQuestionSource({ getQuestions: () => Promise.reject(failure) }, seeded(10));
    await expect(source.getQuestions(REQUEST)).rejects.toBe(failure);
  });

  it('TopicRejectedError propagates as is', async () => {
    const rejected = new TopicRejectedError();
    const source = new ShuffledQuestionSource({ getQuestions: () => Promise.reject(rejected) }, seeded(11));
    await expect(source.getQuestions(REQUEST)).rejects.toBe(rejected);
  });

  it('an empty batch stays empty', async () => {
    const source = new ShuffledQuestionSource({ getQuestions: () => Promise.resolve({ questions: [], origin: 'ai' }) }, seeded(12));
    await expect(source.getQuestions(REQUEST)).resolves.toEqual({ questions: [], origin: 'ai' });
  });
});

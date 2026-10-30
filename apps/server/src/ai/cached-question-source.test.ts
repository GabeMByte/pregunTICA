import { describe, expect, it, vi } from 'vitest';
import { makeQuestions } from '../engine/test-helpers.js';
import { TopicRejectedError, type QuestionBatch, type QuestionRequest } from '../rooms/question-source.js';
import { CACHE_MAX_ENTRIES, CachedQuestionSource, cacheKey } from './cached-question-source.js';
import { deferred, flushMicrotasks, observe, type Deferred } from './test-fakes.js';

const REQUEST: QuestionRequest = { topic: 'Volcanes de Costa Rica', count: 5, difficulty: 'medium', language: 'es' };

type GetQuestions = (request: QuestionRequest) => Promise<QuestionBatch>;

/** A batch whose prompts carry the topic, so tests can tell batches apart. */
function batchFor(request: QuestionRequest, origin: QuestionBatch['origin'] = 'ai'): QuestionBatch {
  return { questions: makeQuestions(request.count).map((q) => ({ ...q, prompt: `${request.topic}: ${q.prompt}` })), origin };
}

function setup(impl: GetQuestions = (request) => Promise.resolve(batchFor(request)), maxEntries?: number) {
  const inner = vi.fn<GetQuestions>(impl);
  const cache = maxEntries === undefined ? new CachedQuestionSource({ getQuestions: inner }) : new CachedQuestionSource({ getQuestions: inner }, maxEntries);
  return { cache, inner };
}

describe('SPEC §6 cache key (cacheKey)', () => {
  it('is "<normalized topic>|count|difficulty|language"', () => {
    expect(cacheKey({ topic: 'Volcanes', count: 5, difficulty: 'medium', language: 'es' })).toBe('volcanes|5|medium|es');
  });

  it('normalizes case and whitespace', () => {
    expect(cacheKey({ ...REQUEST, topic: '  Volcanes   de COSTA rica ' })).toBe(cacheKey({ ...REQUEST, topic: 'volcanes de costa rica' }));
  });

  it('normalizes NFKC (fullwidth and decomposed accents)', () => {
    expect(cacheKey({ ...REQUEST, topic: '\uFF23af\u00E9' })).toBe(cacheKey({ ...REQUEST, topic: 'caf\u00E9' }));
    expect(cacheKey({ ...REQUEST, topic: 'cafe\u0301' })).toBe(cacheKey({ ...REQUEST, topic: 'caf\u00E9' }));
  });

  it.each([
    ['count', { count: 6 }],
    ['difficulty', { difficulty: 'hard' }],
    ['language', { language: 'en' }],
    ['topic', { topic: 'Volcanes de Nicaragua' }],
  ] as const)('a different %s gives a different key', (_label, patch) => {
    expect(cacheKey({ ...REQUEST, ...patch })).not.toBe(cacheKey(REQUEST));
  });

  it('the signal does not affect the key', () => {
    expect(cacheKey({ ...REQUEST, signal: new AbortController().signal })).toBe(cacheKey(REQUEST));
  });
});

describe('SPEC §6 cache hits and misses', () => {
  it('starts empty', () => {
    expect(setup().cache.size).toBe(0);
  });

  it('a miss calls the inner source; a hit does not and returns the same content', async () => {
    const { cache, inner } = setup();
    const first = await cache.getQuestions(REQUEST);
    const second = await cache.getQuestions(REQUEST);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(first).toEqual(batchFor(REQUEST));
    expect(cache.size).toBe(1);
  });

  it('the same topic written differently is a hit', async () => {
    const { cache, inner } = setup();
    await cache.getQuestions(REQUEST);
    await cache.getQuestions({ ...REQUEST, topic: '  VOLCANES de   costa rica' });
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('different count, difficulty or language are separate entries', async () => {
    const { cache, inner } = setup();
    await cache.getQuestions(REQUEST);
    await cache.getQuestions({ ...REQUEST, count: 6 });
    await cache.getQuestions({ ...REQUEST, difficulty: 'easy' });
    await cache.getQuestions({ ...REQUEST, language: 'en' });
    expect(inner).toHaveBeenCalledTimes(4);
    expect(cache.size).toBe(4);
  });

  it('returns copies: mutating a result does not alter the cache', async () => {
    const { cache } = setup();
    const first = await cache.getQuestions(REQUEST);
    first.questions[0]?.options.splice(0, 1, 'changed');
    first.questions.pop();
    const second = await cache.getQuestions(REQUEST);
    expect(second).toEqual(batchFor(REQUEST));
    second.questions.length = 0;
    expect(await cache.getQuestions(REQUEST)).toEqual(batchFor(REQUEST));
  });
});

describe('SPEC §6 cache only stores AI questions', () => {
  it('a fallback batch is returned but not stored', async () => {
    const { cache, inner } = setup((request) => Promise.resolve(batchFor(request, 'fallback')));
    expect((await cache.getQuestions(REQUEST)).origin).toBe('fallback');
    expect(cache.size).toBe(0);
    await cache.getQuestions(REQUEST);
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it('errors are not cached: the next call tries again', async () => {
    const { cache, inner } = setup();
    inner.mockRejectedValueOnce(new Error('boom'));
    await expect(cache.getQuestions(REQUEST)).rejects.toThrow('boom');
    expect(cache.size).toBe(0);
    await expect(cache.getQuestions(REQUEST)).resolves.toEqual(batchFor(REQUEST));
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it('TopicRejectedError propagates as is and is not cached', async () => {
    const rejected = new TopicRejectedError();
    const { cache, inner } = setup();
    inner.mockRejectedValueOnce(rejected);
    await expect(cache.getQuestions(REQUEST)).rejects.toBe(rejected);
    expect(cache.size).toBe(0);
    await cache.getQuestions(REQUEST);
    expect(inner).toHaveBeenCalledTimes(2);
  });
});

describe('SPEC §6 cache: identical requests in flight share one call', () => {
  it('two concurrent identical requests → one inner call, both get the result as distinct copies', async () => {
    const pending = deferred<QuestionBatch>();
    const { cache, inner } = setup(() => pending.promise);
    const a = observe(cache.getQuestions(REQUEST));
    const b = observe(cache.getQuestions({ ...REQUEST, topic: 'volcanes de costa rica' }));
    pending.resolve(batchFor(REQUEST));
    const [first, second] = await Promise.all([a, b]);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(first).toEqual(batchFor(REQUEST));
    expect(second).toEqual(first);
    expect(second.questions).not.toBe(first.questions);
  });

  it('if the shared call fails, both reject and the next request calls again', async () => {
    const pending = deferred<QuestionBatch>();
    const { cache, inner } = setup(() => pending.promise);
    const a = observe(cache.getQuestions(REQUEST));
    const b = observe(cache.getQuestions(REQUEST));
    const failure = new Error('boom');
    pending.reject(failure);
    await expect(a).rejects.toBe(failure);
    await expect(b).rejects.toBe(failure);
    inner.mockImplementation((request) => Promise.resolve(batchFor(request)));
    await expect(cache.getQuestions(REQUEST)).resolves.toEqual(batchFor(REQUEST));
    expect(inner).toHaveBeenCalledTimes(2);
  });
});

describe('SPEC §6 cache limit (LRU)', () => {
  it(`CACHE_MAX_ENTRIES is 100`, () => {
    expect(CACHE_MAX_ENTRIES).toBe(100);
  });

  it('with 2 entries: A, B, read A, C → B is evicted and A stays', async () => {
    const { cache, inner } = setup(undefined, 2);
    const a = { ...REQUEST, topic: 'A topic' };
    const b = { ...REQUEST, topic: 'B topic' };
    const c = { ...REQUEST, topic: 'C topic' };
    await cache.getQuestions(a);
    await cache.getQuestions(b);
    await cache.getQuestions(a);
    await cache.getQuestions(c);
    expect(inner).toHaveBeenCalledTimes(3);
    expect(cache.size).toBe(2);

    await cache.getQuestions(a);
    expect(inner).toHaveBeenCalledTimes(3);
    await cache.getQuestions(b);
    expect(inner).toHaveBeenCalledTimes(4);
    expect(inner.mock.calls[3]?.[0].topic).toBe('B topic');
  });

  it('never grows beyond maxEntries', async () => {
    const { cache } = setup(undefined, 3);
    for (let i = 0; i < 10; i++) await cache.getQuestions({ ...REQUEST, topic: `Topic ${String(i)}` });
    expect(cache.size).toBe(3);
  });
});

describe('SPEC §6 WARM_TOPICS (warm)', () => {
  it('generates each topic in sequence in Spanish, 5 questions, medium', async () => {
    const calls: Deferred<QuestionBatch>[] = [];
    const { cache, inner } = setup(() => {
      const next = deferred<QuestionBatch>();
      calls.push(next);
      return next.promise;
    });
    const warming = observe(cache.warm(['Volcanes', 'Café']));
    await flushMicrotasks();
    expect(inner).toHaveBeenCalledTimes(1);
    expect(inner.mock.calls[0]?.[0]).toMatchObject({ topic: 'Volcanes', count: 5, difficulty: 'medium', language: 'es' });

    calls[0]?.resolve(batchFor({ ...REQUEST, topic: 'Volcanes' }));
    await flushMicrotasks();
    expect(inner).toHaveBeenCalledTimes(2);
    expect(inner.mock.calls[1]?.[0]).toMatchObject({ topic: 'Café', count: 5, difficulty: 'medium', language: 'es' });

    calls[1]?.resolve(batchFor({ ...REQUEST, topic: 'Café' }));
    await expect(warming).resolves.toBeUndefined();
    expect(cache.size).toBe(2);
  });

  it('a warmed topic is a cache hit afterwards', async () => {
    const { cache, inner } = setup();
    await cache.warm(['Volcanes']);
    await cache.getQuestions({ topic: 'volcanes', count: 5, difficulty: 'medium', language: 'es' });
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('a failing topic is reported through onError and the next one continues', async () => {
    const failure = new Error('boom');
    const { cache, inner } = setup();
    inner.mockRejectedValueOnce(failure);
    const onError = vi.fn<(topic: string, error: unknown) => void>();
    await expect(cache.warm(['Volcanes', 'Café'], onError)).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('Volcanes', failure);
    expect(inner).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(1);
  });

  it('never rejects, even without onError or with a rejected topic', async () => {
    const { cache, inner } = setup();
    inner.mockRejectedValueOnce(new TopicRejectedError());
    inner.mockRejectedValueOnce(new Error('boom'));
    await expect(cache.warm(['Bad', 'Broken'])).resolves.toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('an empty list does nothing', async () => {
    const { cache, inner } = setup();
    await cache.warm([]);
    expect(inner).not.toHaveBeenCalled();
  });
});

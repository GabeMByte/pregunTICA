import { describe, expect, it, vi } from 'vitest';
import { makeQuestions } from '../engine/test-helpers.js';
import { TopicRejectedError, type QuestionBatch, type QuestionRequest } from '../rooms/question-source.js';
import { HOUR_MS, LimitedQuestionSource, MAX_CONCURRENT_GENERATIONS, MAX_GENERATIONS_PER_HOUR } from './limited-question-source.js';
import { deferred, flushMicrotasks, observe, type Deferred } from './test-fakes.js';

const REQUEST: QuestionRequest = { topic: 'Volcanes de Costa Rica', count: 5, difficulty: 'medium', language: 'es' };
const AI_BATCH: QuestionBatch = { questions: makeQuestions(5), origin: 'ai' };
const BANK_QUESTIONS = makeQuestions(5, [3, 3, 3, 3, 3]).map((q) => ({ ...q, prompt: `Bank ${q.prompt}` }));
const FALLBACK_BATCH: QuestionBatch = { questions: BANK_QUESTIONS, origin: 'fallback' };

type GetQuestions = (request: QuestionRequest) => Promise<QuestionBatch>;

interface SetupOptions {
  primaryImpl?: GetQuestions;
  fallbackImpl?: GetQuestions;
  maxConcurrent?: number;
  maxPerHour?: number;
}

function setup(options: SetupOptions = {}) {
  const clock = { now: 1_000_000 };
  const primary = vi.fn<GetQuestions>(options.primaryImpl ?? (() => Promise.resolve(AI_BATCH)));
  const fallback = vi.fn<GetQuestions>(options.fallbackImpl ?? (() => Promise.resolve(FALLBACK_BATCH)));
  const onLimited = vi.fn<(reason: string) => void>();
  const source = new LimitedQuestionSource({
    primary: { getQuestions: primary },
    fallback: { getQuestions: fallback },
    clock: () => clock.now,
    onLimited,
    ...(options.maxConcurrent === undefined ? {} : { maxConcurrent: options.maxConcurrent }),
    ...(options.maxPerHour === undefined ? {} : { maxPerHour: options.maxPerHour }),
  });
  return { source, clock, primary, fallback, onLimited };
}

/** A primary whose calls stay in flight until the test settles them. */
function pendingPrimary() {
  const calls: Deferred<QuestionBatch>[] = [];
  const impl: GetQuestions = () => {
    const next = deferred<QuestionBatch>();
    calls.push(next);
    return next.promise;
  };
  return { calls, impl };
}

function start(source: LimitedQuestionSource, request: QuestionRequest = REQUEST): Promise<QuestionBatch> {
  return observe(source.getQuestions(request));
}

function lastReason(onLimited: ReturnType<typeof setup>['onLimited']): string {
  const reason = onLimited.mock.calls.at(-1)?.[0];
  if (reason === undefined) throw new Error('onLimited was not called');
  return reason;
}

describe('security review M3: limits (constants)', () => {
  it('MAX_CONCURRENT_GENERATIONS = 3, MAX_GENERATIONS_PER_HOUR = 60, HOUR_MS = 1 h', () => {
    expect(MAX_CONCURRENT_GENERATIONS).toBe(3);
    expect(MAX_GENERATIONS_PER_HOUR).toBe(60);
    expect(HOUR_MS).toBe(3_600_000);
  });
});

describe('security review M3: under the limits', () => {
  it('returns the primary batch as is; the fallback and onLimited are not used', async () => {
    const { source, primary, fallback, onLimited } = setup();
    await expect(source.getQuestions(REQUEST)).resolves.toEqual(AI_BATCH);
    expect(primary).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
    expect(onLimited).not.toHaveBeenCalled();
  });

  it('keeps the origin the primary reports (Fallback(Claude, Local) may already say fallback)', async () => {
    const { source } = setup({ primaryImpl: () => Promise.resolve(FALLBACK_BATCH) });
    await expect(source.getQuestions(REQUEST)).resolves.toEqual(FALLBACK_BATCH);
  });

  it('passes the request to the primary unchanged (signal included)', async () => {
    const { source, primary } = setup();
    const signal = new AbortController().signal;
    await source.getQuestions({ ...REQUEST, signal });
    expect(primary.mock.calls[0]?.[0]).toEqual({ ...REQUEST, signal });
    expect(primary.mock.calls[0]?.[0].signal).toBe(signal);
  });

  it('works without onLimited', async () => {
    const pending = pendingPrimary();
    const source = new LimitedQuestionSource({
      primary: { getQuestions: pending.impl },
      fallback: { getQuestions: () => Promise.resolve(FALLBACK_BATCH) },
      clock: () => 0,
      maxConcurrent: 1,
    });
    void start(source);
    await expect(source.getQuestions(REQUEST)).resolves.toMatchObject({ origin: 'fallback' });
  });
});

describe('security review M3: concurrent generations', () => {
  it('with maxConcurrent - 1 in flight the next call still goes to the primary', async () => {
    const pending = pendingPrimary();
    const { source, primary, fallback } = setup({ primaryImpl: pending.impl, maxConcurrent: 2 });
    void start(source);
    void start(source);
    await flushMicrotasks();
    expect(primary).toHaveBeenCalledTimes(2);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('with maxConcurrent in flight the next call answers from the fallback and reports "concurrent"', async () => {
    const pending = pendingPrimary();
    const { source, primary, fallback, onLimited } = setup({ primaryImpl: pending.impl, maxConcurrent: 2 });
    void start(source);
    void start(source);
    const third = start(source, { ...REQUEST, topic: 'Café' });

    await expect(third).resolves.toEqual({ questions: BANK_QUESTIONS, origin: 'fallback' });
    expect(primary).toHaveBeenCalledTimes(2);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(fallback.mock.calls[0]?.[0]).toMatchObject({ topic: 'Café', count: 5, difficulty: 'medium', language: 'es' });
    expect(onLimited).toHaveBeenCalledTimes(1);
    expect(lastReason(onLimited)).toMatch(/concurrent/i);
  });

  it(`defaults to ${String(MAX_CONCURRENT_GENERATIONS)} concurrent generations`, async () => {
    const pending = pendingPrimary();
    const { source, primary, fallback, onLimited } = setup({ primaryImpl: pending.impl });
    for (let i = 0; i < MAX_CONCURRENT_GENERATIONS; i++) void start(source);
    await flushMicrotasks();
    expect(primary).toHaveBeenCalledTimes(MAX_CONCURRENT_GENERATIONS);
    expect(fallback).not.toHaveBeenCalled();

    await expect(start(source)).resolves.toMatchObject({ origin: 'fallback' });
    expect(primary).toHaveBeenCalledTimes(MAX_CONCURRENT_GENERATIONS);
    expect(lastReason(onLimited)).toMatch(/concurrent/i);
  });

  it('a slot is released when the primary resolves', async () => {
    const pending = pendingPrimary();
    const { source, primary } = setup({ primaryImpl: pending.impl, maxConcurrent: 1 });
    const first = start(source);
    await expect(start(source)).resolves.toMatchObject({ origin: 'fallback' });

    pending.calls[0]?.resolve(AI_BATCH);
    await expect(first).resolves.toEqual(AI_BATCH);
    void start(source);
    await flushMicrotasks();
    expect(primary).toHaveBeenCalledTimes(2);
  });

  it('a slot is released when the primary rejects', async () => {
    const pending = pendingPrimary();
    const { source, primary, fallback } = setup({ primaryImpl: pending.impl, maxConcurrent: 1 });
    const first = start(source);
    const failure = new Error('boom');
    pending.calls[0]?.reject(failure);
    await expect(first).rejects.toBe(failure);

    void start(source);
    await flushMicrotasks();
    expect(primary).toHaveBeenCalledTimes(2);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('a call answered from the fallback does not take a primary slot', async () => {
    const pending = pendingPrimary();
    const { source, primary } = setup({ primaryImpl: pending.impl, maxConcurrent: 1 });
    const first = start(source);
    await start(source);
    await start(source);
    pending.calls[0]?.resolve(AI_BATCH);
    await first;
    void start(source);
    await flushMicrotasks();
    expect(primary).toHaveBeenCalledTimes(2);
  });
});

describe('security review M3: generations per hour (sliding window, injected clock)', () => {
  it('after maxPerHour primary calls in the last hour the next one answers from the fallback and reports "hour"', async () => {
    const { source, clock, primary, fallback, onLimited } = setup({ maxPerHour: 2 });
    await source.getQuestions(REQUEST);
    clock.now += 1_000;
    await source.getQuestions(REQUEST);
    clock.now += 1_000;

    await expect(source.getQuestions(REQUEST)).resolves.toEqual({ questions: BANK_QUESTIONS, origin: 'fallback' });
    expect(primary).toHaveBeenCalledTimes(2);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(onLimited).toHaveBeenCalledTimes(1);
    expect(lastReason(onLimited)).toMatch(/hour/i);
  });

  it('1 ms before HOUR_MS since the oldest start it is still limited; at HOUR_MS the primary is allowed again', async () => {
    const { source, clock, primary } = setup({ maxPerHour: 2 });
    const t0 = clock.now;
    await source.getQuestions(REQUEST);
    clock.now = t0 + 1_000;
    await source.getQuestions(REQUEST);

    clock.now = t0 + HOUR_MS - 1;
    await expect(source.getQuestions(REQUEST)).resolves.toMatchObject({ origin: 'fallback' });
    expect(primary).toHaveBeenCalledTimes(2);

    clock.now = t0 + HOUR_MS;
    await expect(source.getQuestions(REQUEST)).resolves.toEqual(AI_BATCH);
    expect(primary).toHaveBeenCalledTimes(3);

    // The window still holds the call at t0 + 1000 and the one at t0 + HOUR_MS.
    await expect(source.getQuestions(REQUEST)).resolves.toMatchObject({ origin: 'fallback' });
    clock.now = t0 + 1_000 + HOUR_MS;
    await expect(source.getQuestions(REQUEST)).resolves.toEqual(AI_BATCH);
    expect(primary).toHaveBeenCalledTimes(4);
  });

  it('calls answered from the fallback do not count toward the hourly limit', async () => {
    const { source, clock, primary } = setup({ maxPerHour: 1 });
    const t0 = clock.now;
    await source.getQuestions(REQUEST);
    for (let i = 1; i <= 5; i++) {
      clock.now = t0 + i * 60_000;
      await source.getQuestions(REQUEST);
    }
    clock.now = t0 + HOUR_MS;
    await expect(source.getQuestions(REQUEST)).resolves.toEqual(AI_BATCH);
    expect(primary).toHaveBeenCalledTimes(2);
  });

  it('failed primary calls still count toward the hourly limit', async () => {
    const failure = new Error('boom');
    const { source, primary, onLimited } = setup({ primaryImpl: () => Promise.reject(failure), maxPerHour: 2 });
    await expect(source.getQuestions(REQUEST)).rejects.toBe(failure);
    await expect(source.getQuestions(REQUEST)).rejects.toBe(failure);
    await expect(source.getQuestions(REQUEST)).resolves.toMatchObject({ origin: 'fallback' });
    expect(primary).toHaveBeenCalledTimes(2);
    expect(lastReason(onLimited)).toMatch(/hour/i);
  });

  it(`defaults to ${String(MAX_GENERATIONS_PER_HOUR)} generations per hour`, async () => {
    const { source, primary, fallback } = setup();
    for (let i = 0; i < MAX_GENERATIONS_PER_HOUR; i++) await source.getQuestions(REQUEST);
    expect(primary).toHaveBeenCalledTimes(MAX_GENERATIONS_PER_HOUR);
    expect(fallback).not.toHaveBeenCalled();
    await expect(source.getQuestions(REQUEST)).resolves.toMatchObject({ origin: 'fallback' });
    expect(primary).toHaveBeenCalledTimes(MAX_GENERATIONS_PER_HOUR);
  });
});

describe('security review M3: fallback answers and errors', () => {
  it('a limited answer is marked fallback even if the fallback source says ai', async () => {
    const { source } = setup({ maxPerHour: 1, fallbackImpl: () => Promise.resolve(AI_BATCH) });
    await source.getQuestions(REQUEST);
    await expect(source.getQuestions(REQUEST)).resolves.toEqual({ questions: AI_BATCH.questions, origin: 'fallback' });
  });

  it('a primary Error propagates as is and is not converted to a fallback', async () => {
    const failure = new Error('boom');
    const { source, fallback, onLimited } = setup({ primaryImpl: () => Promise.reject(failure) });
    await expect(source.getQuestions(REQUEST)).rejects.toBe(failure);
    expect(fallback).not.toHaveBeenCalled();
    expect(onLimited).not.toHaveBeenCalled();
  });

  it('TopicRejectedError propagates as is and is not converted to a fallback', async () => {
    const rejected = new TopicRejectedError();
    const { source, fallback, onLimited } = setup({ primaryImpl: () => Promise.reject(rejected) });
    await expect(source.getQuestions(REQUEST)).rejects.toBe(rejected);
    expect(fallback).not.toHaveBeenCalled();
    expect(onLimited).not.toHaveBeenCalled();
  });

  it('the fallback is never called while under the limits', async () => {
    const { source, clock, fallback } = setup({ maxPerHour: 5, maxConcurrent: 1 });
    for (let i = 0; i < 5; i++) {
      await source.getQuestions(REQUEST);
      clock.now += 1_000;
    }
    expect(fallback).not.toHaveBeenCalled();
  });
});

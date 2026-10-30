import { describe, expect, it, vi } from 'vitest';
import { makeQuestions } from '../engine/test-helpers.js';
import { TopicRejectedError, type QuestionBatch, type QuestionRequest } from '../rooms/question-source.js';
import { AI_TIMEOUT_MS, FallbackQuestionSource } from './fallback-question-source.js';
import { createScheduler, deferred, flushMicrotasks, observe, type FakeTimer } from './test-fakes.js';

const REQUEST: QuestionRequest = { topic: 'Volcanes de Costa Rica', count: 5, difficulty: 'medium', language: 'es' };
const AI_BATCH: QuestionBatch = { questions: makeQuestions(5), origin: 'ai' };
const BANK_QUESTIONS = makeQuestions(5, [3, 3, 3, 3, 3]).map((q) => ({ ...q, prompt: `Bank ${q.prompt}` }));
const FALLBACK_BATCH: QuestionBatch = { questions: BANK_QUESTIONS, origin: 'fallback' };

type GetQuestions = (request: QuestionRequest) => Promise<QuestionBatch>;

function setup(primaryImpl: GetQuestions, options: { fallbackImpl?: GetQuestions; timeoutMs?: number } = {}) {
  const scheduler = createScheduler();
  const primary = vi.fn<GetQuestions>(primaryImpl);
  const fallback = vi.fn<GetQuestions>(options.fallbackImpl ?? (() => Promise.resolve(FALLBACK_BATCH)));
  const onFallback = vi.fn<(reason: string) => void>();
  const source = new FallbackQuestionSource({
    primary: { getQuestions: primary },
    fallback: { getQuestions: fallback },
    scheduler,
    onFallback,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  return { source, scheduler, primary, fallback, onFallback };
}

/** Starts a request whose rejection is observed even if the test fails before awaiting it. */
function start(source: FallbackQuestionSource): Promise<QuestionBatch> {
  return observe(source.getQuestions(REQUEST));
}

function onlyTimer(timers: readonly FakeTimer[]): FakeTimer {
  expect(timers).toHaveLength(1);
  const [timer] = timers;
  if (timer === undefined) throw new Error('no timer');
  return timer;
}

function signalOf(mock: ReturnType<typeof vi.fn<GetQuestions>>): AbortSignal | undefined {
  return mock.mock.calls[0]?.[0].signal;
}

describe('SPEC §6 fallback: the AI answers in time', () => {
  it('returns the primary batch and clears the timeout; the fallback is not used', async () => {
    const { source, scheduler, fallback, onFallback } = setup(() => Promise.resolve(AI_BATCH));
    await expect(source.getQuestions(REQUEST)).resolves.toEqual(AI_BATCH);
    const timer = onlyTimer(scheduler.timers);
    expect(scheduler.clear).toHaveBeenCalledWith(timer);
    expect(fallback).not.toHaveBeenCalled();
    expect(onFallback).not.toHaveBeenCalled();
  });

  it('keeps the origin reported by the primary', async () => {
    const { source } = setup(() => Promise.resolve({ ...AI_BATCH, origin: 'fallback' }));
    expect((await source.getQuestions(REQUEST)).origin).toBe('fallback');
  });

  it('the primary gets the request data and an abort signal', async () => {
    const { source, primary } = setup(() => Promise.resolve(AI_BATCH));
    await source.getQuestions(REQUEST);
    expect(primary).toHaveBeenCalledTimes(1);
    expect(primary.mock.calls[0]?.[0]).toMatchObject({ topic: REQUEST.topic, count: 5, difficulty: 'medium', language: 'es' });
    expect(signalOf(primary)).toBeInstanceOf(AbortSignal);
    expect(signalOf(primary)?.aborted).toBe(false);
  });
});

describe('SPEC §6 fallback: the AI fails', () => {
  it('an Error → answers from the fallback with origin fallback and reports why', async () => {
    const { source, fallback, onFallback, scheduler } = setup(() => Promise.reject(new Error('boom')));
    const batch = await source.getQuestions(REQUEST);
    expect(batch).toEqual({ questions: BANK_QUESTIONS, origin: 'fallback' });
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(fallback.mock.calls[0]?.[0]).toMatchObject({ topic: REQUEST.topic, count: 5, difficulty: 'medium', language: 'es' });
    expect(onFallback).toHaveBeenCalledTimes(1);
    const [reason] = onFallback.mock.calls[0] ?? [];
    expect(typeof reason).toBe('string');
    expect(reason?.length ?? 0).toBeGreaterThan(0);
    expect(scheduler.clear).toHaveBeenCalledWith(onlyTimer(scheduler.timers));
  });

  it('the result is marked fallback even if the fallback source says otherwise', async () => {
    const { source } = setup(() => Promise.reject(new Error('boom')), { fallbackImpl: () => Promise.resolve(AI_BATCH) });
    expect((await source.getQuestions(REQUEST)).origin).toBe('fallback');
  });

  it('TopicRejectedError is rethrown: no fallback, no onFallback', async () => {
    const rejected = new TopicRejectedError();
    const { source, fallback, onFallback } = setup(() => Promise.reject(rejected));
    await expect(source.getQuestions(REQUEST)).rejects.toBe(rejected);
    expect(fallback).not.toHaveBeenCalled();
    expect(onFallback).not.toHaveBeenCalled();
  });

  it('if the fallback also fails → rejects with the fallback error', async () => {
    const bankError = new Error('bank broken');
    const { source } = setup(() => Promise.reject(new Error('boom')), { fallbackImpl: () => Promise.reject(bankError) });
    await expect(source.getQuestions(REQUEST)).rejects.toBe(bankError);
  });
});

describe('SPEC §6 fallback: 15 s timeout (includes the retry)', () => {
  it(`schedules the timeout with AI_TIMEOUT_MS = ${AI_TIMEOUT_MS} by default`, () => {
    expect(AI_TIMEOUT_MS).toBe(15_000);
    const { source, scheduler } = setup(() => deferred<QuestionBatch>().promise);
    void start(source);
    expect(onlyTimer(scheduler.timers).delayMs).toBe(15_000);
  });

  it('the timeout is configurable', () => {
    const { source, scheduler } = setup(() => deferred<QuestionBatch>().promise, { timeoutMs: 500 });
    void start(source);
    expect(onlyTimer(scheduler.timers).delayMs).toBe(500);
  });

  it('when the timer fires: aborts the primary signal and answers from the fallback', async () => {
    const pending = deferred<QuestionBatch>();
    const { source, scheduler, primary, fallback, onFallback } = setup(() => pending.promise);
    const result = start(source);
    await flushMicrotasks();
    scheduler.fire(onlyTimer(scheduler.timers));

    await expect(result).resolves.toEqual({ questions: BANK_QUESTIONS, origin: 'fallback' });
    expect(signalOf(primary)?.aborted).toBe(true);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(onFallback.mock.calls[0]?.[0]).toMatch(/timeout/i);
  });

  it('the fallback does not receive the aborted signal', async () => {
    const { source, scheduler, fallback } = setup(() => deferred<QuestionBatch>().promise);
    const result = start(source);
    await flushMicrotasks();
    scheduler.fire(onlyTimer(scheduler.timers));
    await result;
    expect(signalOf(fallback)?.aborted ?? false).toBe(false);
  });

  it('a late primary answer is ignored: the result stays the fallback and the fallback runs once', async () => {
    const pending = deferred<QuestionBatch>();
    const { source, scheduler, fallback, onFallback } = setup(() => pending.promise);
    const result = start(source);
    await flushMicrotasks();
    scheduler.fire(onlyTimer(scheduler.timers));
    pending.resolve(AI_BATCH);
    await flushMicrotasks();

    await expect(result).resolves.toMatchObject({ origin: 'fallback', questions: BANK_QUESTIONS });
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it('a primary that rejects after the abort does not trigger a second fallback', async () => {
    const pending = deferred<QuestionBatch>();
    const { source, scheduler, fallback, onFallback } = setup(() => pending.promise);
    const result = start(source);
    await flushMicrotasks();
    scheduler.fire(onlyTimer(scheduler.timers));
    pending.reject(new Error('Request was aborted.'));
    await flushMicrotasks();

    await expect(result).resolves.toMatchObject({ origin: 'fallback' });
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(onFallback).toHaveBeenCalledTimes(1);
  });
});

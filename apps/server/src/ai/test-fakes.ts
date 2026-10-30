/**
 * Test fixtures for the AI layer. Builders and fakes only: no assertions about behavior.
 * Never touches the real API: CreateMessage is replaced by a queue of canned responses.
 * Time and randomness are always injected; nothing here uses real timers.
 */
import { vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import type { Question } from '@preguntica/shared';
import type { TimerHandle } from '../rooms/room-registry.js';
import type { CreateMessage } from './claude-question-source.js';

/** A complete, valid Anthropic.Message with the given content blocks. */
export function fakeMessage(content: Anthropic.ContentBlock[], stopReason: Anthropic.StopReason | null = 'tool_use'): Anthropic.Message {
  return {
    id: 'msg_test',
    container: null,
    content,
    diagnostics: null,
    model: 'claude-test',
    role: 'assistant',
    stop_details: null,
    stop_reason: stopReason,
    stop_sequence: null,
    type: 'message',
    usage: {
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      inference_geo: null,
      input_tokens: 100,
      output_tokens: 200,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: 'standard',
      speed: null,
    },
  };
}

export function toolUse(name: string, input: unknown, id = 'toolu_1'): Anthropic.ToolUseBlock {
  return { type: 'tool_use', id, name, input, caller: { type: 'direct' } };
}

export function textBlock(text: string): Anthropic.TextBlock {
  return { type: 'text', text, citations: null };
}

/** A tool_use submit_questions response with `{ questions }` as input. */
export function submitMessage(questions: unknown, id = 'toolu_1', stopReason: Anthropic.StopReason = 'tool_use'): Anthropic.Message {
  return fakeMessage([toolUse('submit_questions', { questions }, id)], stopReason);
}

export function rejectMessage(reason: 'inappropriate' | 'prompt_injection' = 'inappropriate', id = 'toolu_r'): Anthropic.Message {
  return fakeMessage([toolUse('reject_topic', { reason }, id)]);
}

export interface RecordedCall {
  params: Anthropic.MessageCreateParamsNonStreaming;
  options: { signal?: AbortSignal };
}

/**
 * A fake CreateMessage that answers from a queue (a queued Error is thrown) and records a snapshot
 * of (params, options) for every call. An empty queue throws, so unexpected calls are visible.
 */
export function fakeCreateMessage(responses: readonly (Anthropic.Message | Error)[], onCall?: () => void) {
  const queue = [...responses];
  const calls: RecordedCall[] = [];
  const createMessage = vi.fn<CreateMessage>((params, options) => {
    calls.push({ params: structuredClone(params), options });
    onCall?.();
    const next = queue.shift();
    if (next === undefined) return Promise.reject(new Error('fake createMessage: no more responses'));
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next);
  });
  return { createMessage, calls };
}

/** Text of a message content (string or text blocks), for assertions on prompts sent to the model. */
export function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block: unknown) => {
      if (typeof block !== 'object' || block === null) return '';
      const record = block as Record<string, unknown>;
      if (typeof record.text === 'string') return record.text;
      if ('content' in record) return contentText(record.content);
      return '';
    })
    .join('\n');
}

/** Deterministic pseudo-random source (Park–Miller LCG) in [0, 1). */
export function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

export function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = observe(
    new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    }),
  );
  return {
    promise,
    resolve: (value) => {
      resolve(value);
    },
    reject: (error) => {
      reject(error);
    },
  };
}

/**
 * Marks a promise as observed so a rejection never surfaces as an unhandled rejection when a test
 * fails before awaiting it. Returns the same promise: later awaits still see the rejection.
 */
export function observe<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => undefined);
  return promise;
}

/** Lets pending promise callbacks run (microtasks only, no real timers). */
export async function flushMicrotasks(rounds = 20): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

export interface FakeTimer {
  callback: () => void;
  delayMs: number;
  cleared: boolean;
  fired: boolean;
}

/** Manual scheduler: records timers; the test decides when (and whether) they fire. */
export function createScheduler() {
  const timers: FakeTimer[] = [];
  const set = vi.fn((callback: () => void, delayMs: number): TimerHandle => {
    const timer: FakeTimer = { callback, delayMs, cleared: false, fired: false };
    timers.push(timer);
    return timer;
  });
  const clear = vi.fn((handle: TimerHandle): void => {
    for (const timer of timers) if (timer === handle) timer.cleared = true;
  });
  return {
    timers,
    set,
    clear,
    fire: (timer: FakeTimer) => {
      timer.fired = true;
      timer.callback();
    },
  };
}

/** Text of the correct option. */
export function correctText(question: Question): string | undefined {
  return question.options[question.correctIndex];
}

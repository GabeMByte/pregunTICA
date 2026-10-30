import { describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import type { Question } from '@preguntica/shared';
import { at, makeQuestions } from '../engine/test-helpers.js';
import { TopicRejectedError, type QuestionRequest } from '../rooms/question-source.js';
import { ClaudeQuestionSource, GenerationFailedError, type ClaudeSourceOptions } from './claude-question-source.js';
import { buildSystemPrompt, buildTools, buildUserMessage } from './prompt.js';
import { shuffleQuestions } from './shuffle.js';
import { contentText, correctText, fakeCreateMessage, fakeMessage, rejectMessage, submitMessage, textBlock, toolUse } from './test-fakes.js';
import { validateQuestions } from './validate.js';

const REQUEST: QuestionRequest = { topic: 'Volcanes de Costa Rica', count: 5, difficulty: 'medium', language: 'es' };
const QUESTIONS = makeQuestions(5);
/** Fake API latency: the fake clock advances this much on every call. */
const CALL_MS = 400;

/** 4 questions (5 expected) and one correctIndex out of range. */
const INVALID_QUESTIONS: unknown[] = [...makeQuestions(4)];
INVALID_QUESTIONS[1] = { ...(INVALID_QUESTIONS[1] as Question), correctIndex: 7 };

function validationErrors(questions: unknown): string[] {
  const result = validateQuestions({ questions }, REQUEST.count);
  if (result.ok) throw new Error('fixture should be invalid');
  return result.errors;
}

function setup(responses: readonly (Anthropic.Message | Error)[], overrides: Partial<ClaudeSourceOptions> = {}) {
  const clock = { now: 10_000 };
  const fake = fakeCreateMessage(responses, () => {
    clock.now += CALL_MS;
  });
  const random = vi.fn(() => 0);
  const source = new ClaudeQuestionSource({
    createMessage: fake.createMessage,
    model: 'claude-test-model',
    effort: 'low',
    random,
    clock: () => clock.now,
    ...overrides,
  });
  return { source, calls: fake.calls, createMessage: fake.createMessage, random };
}

function call(calls: ReturnType<typeof setup>['calls'], index: number) {
  return at(calls, index);
}

describe('SPEC §6 Claude request (tool use, auto tool choice)', () => {
  it('sends model, max_tokens, system, the user message, both tools, auto tool choice and effort', async () => {
    const { source, calls } = setup([submitMessage(QUESTIONS)]);
    await source.getQuestions(REQUEST);
    const { params } = call(calls, 0);
    expect(params.model).toBe('claude-test-model');
    expect(params.max_tokens).toBe(16000);
    expect(params.system).toBe(buildSystemPrompt());
    expect(params.messages).toEqual([{ role: 'user', content: buildUserMessage(REQUEST) }]);
    expect(params.tools).toEqual(buildTools());
    expect(params.tool_choice).toEqual({ type: 'auto', disable_parallel_tool_use: true });
    expect(params.output_config).toEqual({ effort: 'low' });
  });

  it('does not send thinking, temperature, top_p or top_k', async () => {
    const { source, calls } = setup([submitMessage(QUESTIONS)]);
    await source.getQuestions(REQUEST);
    const { params } = call(calls, 0);
    for (const key of ['thinking', 'temperature', 'top_p', 'top_k']) expect(params).not.toHaveProperty(key);
  });

  it('uses the configured effort', async () => {
    const { source, calls } = setup([submitMessage(QUESTIONS)], { effort: 'high' });
    await source.getQuestions(REQUEST);
    expect(call(calls, 0).params.output_config).toEqual({ effort: 'high' });
  });

  it('passes the request signal to the SDK call', async () => {
    const controller = new AbortController();
    const { source, calls } = setup([submitMessage(QUESTIONS)]);
    await source.getQuestions({ ...REQUEST, signal: controller.signal });
    expect(call(calls, 0).options.signal).toBe(controller.signal);
  });
});

describe('SPEC §6 valid submit_questions', () => {
  it('returns the questions with origin ai after a single call', async () => {
    const { source, calls } = setup([submitMessage(QUESTIONS)]);
    const batch = await source.getQuestions(REQUEST);
    expect(calls).toHaveLength(1);
    expect(batch.origin).toBe('ai');
    expect(batch.questions).toHaveLength(5);
  });

  it('shuffles the options with the injected random and keeps the correct text', async () => {
    const { source, random } = setup([submitMessage(QUESTIONS)]);
    const batch = await source.getQuestions(REQUEST);
    expect(random).toHaveBeenCalled();
    expect(batch.questions).toEqual(shuffleQuestions(QUESTIONS, () => 0));
    batch.questions.forEach((q, i) => {
      expect(q.prompt).toBe(at(QUESTIONS, i).prompt);
      expect(correctText(q)).toBe(correctText(at(QUESTIONS, i)));
    });
  });

  it('returns the validated (trimmed) questions, not the raw input', async () => {
    const raw = makeQuestions(5).map((q) => ({ ...q, prompt: `  ${q.prompt}  ` }));
    const { source } = setup([submitMessage(raw)], { random: () => 0.999999 });
    const batch = await source.getQuestions(REQUEST);
    expect(batch.questions.map((q) => q.prompt)).toEqual(QUESTIONS.map((q) => q.prompt));
  });
});

describe('SPEC §6 one retry with the concrete validation errors', () => {
  it('invalid input → second call with the assistant turn and an is_error tool_result listing every error', async () => {
    const first = submitMessage(INVALID_QUESTIONS, 'toolu_bad');
    const { source, calls } = setup([first, submitMessage(QUESTIONS, 'toolu_ok')]);
    const batch = await source.getQuestions(REQUEST);

    expect(batch.origin).toBe('ai');
    expect(calls).toHaveLength(2);
    const { params } = call(calls, 1);
    expect(params.messages).toHaveLength(3);
    expect(at(params.messages, 0)).toEqual({ role: 'user', content: buildUserMessage(REQUEST) });
    expect(at(params.messages, 1)).toEqual({ role: 'assistant', content: first.content });

    const retry = at(params.messages, 2);
    expect(retry.role).toBe('user');
    expect(Array.isArray(retry.content)).toBe(true);
    const blocks = retry.content as Anthropic.ContentBlockParam[];
    expect(blocks).toHaveLength(1);
    const result = at(blocks, 0) as Anthropic.ToolResultBlockParam;
    expect(result).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_bad', is_error: true });
    const text = contentText(result.content);
    for (const error of validationErrors(INVALID_QUESTIONS)) expect(text).toContain(error);
  });

  it('the retry keeps the same model, system, tools, tool choice and signal', async () => {
    const controller = new AbortController();
    const { source, calls } = setup([submitMessage(INVALID_QUESTIONS), submitMessage(QUESTIONS)]);
    await source.getQuestions({ ...REQUEST, signal: controller.signal });
    const [firstCall, secondCall] = [call(calls, 0), call(calls, 1)];
    expect({ ...secondCall.params, messages: [] }).toEqual({ ...firstCall.params, messages: [] });
    expect(secondCall.options.signal).toBe(controller.signal);
  });

  it('a response without tool use → retry whose last user message asks for submit_questions or reject_topic', async () => {
    const { source, calls } = setup([fakeMessage([textBlock('Here are your questions!')], 'end_turn'), submitMessage(QUESTIONS)]);
    const batch = await source.getQuestions(REQUEST);
    expect(batch.origin).toBe('ai');
    expect(calls).toHaveLength(2);
    const messages = call(calls, 1).params.messages;
    const last = at(messages, messages.length - 1);
    expect(last.role).toBe('user');
    const text = contentText(last.content);
    expect(text).toContain('submit_questions');
    expect(text).toContain('reject_topic');
  });

  it('stop_reason max_tokens counts as invalid even with a tool_use → retry', async () => {
    const { source, calls } = setup([submitMessage(QUESTIONS, 'toolu_cut', 'max_tokens'), submitMessage(QUESTIONS)]);
    await expect(source.getQuestions(REQUEST)).resolves.toMatchObject({ origin: 'ai' });
    expect(calls).toHaveLength(2);
  });

  it('second attempt also invalid → GenerationFailedError with the errors of the second attempt, never a third call', async () => {
    const second: unknown[] = makeQuestions(5);
    second[0] = { ...(second[0] as Question), prompt: 'p'.repeat(121) };
    const { source, calls } = setup([submitMessage(INVALID_QUESTIONS), submitMessage(second), submitMessage(QUESTIONS)]);
    const error = await source.getQuestions(REQUEST).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GenerationFailedError);
    expect((error as GenerationFailedError).errors).toEqual(validationErrors(second));
    expect(calls).toHaveLength(2);
  });

  it('no tool use twice → GenerationFailedError with errors', async () => {
    const text = fakeMessage([textBlock('Sure!')], 'end_turn');
    const { source, calls } = setup([text, fakeMessage([textBlock('Again!')], 'end_turn'), submitMessage(QUESTIONS)]);
    const error = await source.getQuestions(REQUEST).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GenerationFailedError);
    expect((error as GenerationFailedError).errors).not.toHaveLength(0);
    expect(calls).toHaveLength(2);
  });
});

describe('SPEC §6 rejected topic (TOPIC_REJECTED)', () => {
  it('reject_topic on the first attempt → TopicRejectedError, no retry', async () => {
    const { source, calls } = setup([rejectMessage('inappropriate'), submitMessage(QUESTIONS)]);
    await expect(source.getQuestions(REQUEST)).rejects.toBeInstanceOf(TopicRejectedError);
    expect(calls).toHaveLength(1);
  });

  it('reject_topic on the retry → TopicRejectedError', async () => {
    const { source, calls } = setup([submitMessage(INVALID_QUESTIONS), rejectMessage('prompt_injection')]);
    await expect(source.getQuestions(REQUEST)).rejects.toBeInstanceOf(TopicRejectedError);
    expect(calls).toHaveLength(2);
  });

  it('stop_reason refusal → TopicRejectedError', async () => {
    const { source, calls } = setup([fakeMessage([], 'refusal'), submitMessage(QUESTIONS)]);
    await expect(source.getQuestions(REQUEST)).rejects.toBeInstanceOf(TopicRejectedError);
    expect(calls).toHaveLength(1);
  });

  it('a GenerationFailedError is not a TopicRejectedError (so it can fall back)', async () => {
    const { source } = setup([submitMessage(INVALID_QUESTIONS), submitMessage(INVALID_QUESTIONS)]);
    const error = await source.getQuestions(REQUEST).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GenerationFailedError);
    expect(error).not.toBeInstanceOf(TopicRejectedError);
  });
});

describe('SPEC §6 API errors propagate (the SDK already retries)', () => {
  it('a network error is rethrown as is, without a retry', async () => {
    const network = new Error('network');
    const { source, calls } = setup([network, submitMessage(QUESTIONS)]);
    await expect(source.getQuestions(REQUEST)).rejects.toBe(network);
    expect(calls).toHaveLength(1);
  });

  it('an SDK error is rethrown as is', async () => {
    const sdkError = new Anthropic.APIConnectionError({ message: 'Connection error.' });
    const { source } = setup([sdkError]);
    await expect(source.getQuestions(REQUEST)).rejects.toBe(sdkError);
  });

  it('an error during the retry is rethrown as is', async () => {
    const network = new Error('network on retry');
    const { source, calls } = setup([submitMessage(INVALID_QUESTIONS), network]);
    await expect(source.getQuestions(REQUEST)).rejects.toBe(network);
    expect(calls).toHaveLength(2);
  });
});

describe('SPEC §6 evaluation report (generate)', () => {
  it('ok on the first attempt → attempts 1, no errors, duration from the injected clock, the batch', async () => {
    const { source } = setup([submitMessage(QUESTIONS)]);
    const report = await source.generate(REQUEST);
    expect(report).toMatchObject({ outcome: 'ok', attempts: 1, durationMs: CALL_MS, firstAttemptErrors: [], errors: [] });
    expect(report.batch?.origin).toBe('ai');
    expect(report.batch?.questions).toHaveLength(5);
  });

  it('ok after the retry → attempts 2 and the errors of the first attempt', async () => {
    const { source } = setup([submitMessage(INVALID_QUESTIONS), submitMessage(QUESTIONS)]);
    const report = await source.generate(REQUEST);
    expect(report).toMatchObject({ outcome: 'ok', attempts: 2, durationMs: 2 * CALL_MS, errors: [] });
    expect(report.firstAttemptErrors).toEqual(validationErrors(INVALID_QUESTIONS));
  });

  it('rejected topic → outcome rejected, without throwing and without batch', async () => {
    const { source } = setup([rejectMessage()]);
    const report = await source.generate(REQUEST);
    expect(report).toMatchObject({ outcome: 'rejected', attempts: 1, firstAttemptErrors: [], errors: [] });
    expect(report.batch).toBeUndefined();
  });

  it('failed twice → outcome failed with the errors, without throwing and without batch', async () => {
    const { source } = setup([submitMessage(INVALID_QUESTIONS), submitMessage(INVALID_QUESTIONS)]);
    const report = await source.generate(REQUEST);
    expect(report).toMatchObject({ outcome: 'failed', attempts: 2, durationMs: 2 * CALL_MS });
    expect(report.errors).toEqual(validationErrors(INVALID_QUESTIONS));
    expect(report.firstAttemptErrors).not.toHaveLength(0);
    expect(report.batch).toBeUndefined();
  });

  it('a network error makes generate throw (the eval counts it apart)', async () => {
    const network = new Error('network');
    const { source } = setup([network]);
    await expect(source.generate(REQUEST)).rejects.toBe(network);
  });

  it('reject_topic preceded by a text block → outcome rejected', async () => {
    const { source } = setup([fakeMessage([textBlock('I cannot help with that.'), toolUse('reject_topic', { reason: 'inappropriate' })])]);
    expect((await source.generate(REQUEST)).outcome).toBe('rejected');
  });
});

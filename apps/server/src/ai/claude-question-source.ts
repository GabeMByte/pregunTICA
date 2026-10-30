import type Anthropic from '@anthropic-ai/sdk';
import type { Question } from '@preguntica/shared';
import { TopicRejectedError, type QuestionBatch, type QuestionRequest, type QuestionSource } from '../rooms/question-source.js';
import { REJECT_TOOL, SUBMIT_TOOL, buildSystemPrompt, buildTools, buildUserMessage } from './prompt.js';
import { shuffleQuestions } from './shuffle.js';
import { validateQuestions } from './validate.js';

/** The only SDK call we need; injected so tests never hit the real API. */
export type CreateMessage = (
  params: Anthropic.MessageCreateParamsNonStreaming,
  options: { signal?: AbortSignal },
) => Promise<Anthropic.Message>;

export type Effort = 'low' | 'medium' | 'high';

export interface ClaudeSourceOptions {
  createMessage: CreateMessage;
  model: string;
  effort: Effort;
  random: () => number;
  /** Milliseconds since some origin, for the eval metrics. */
  clock: () => number;
}

/** Both attempts produced invalid questions (or no tool call). Triggers the fallback. */
export class GenerationFailedError extends Error {
  override readonly name = 'GenerationFailedError';

  constructor(readonly errors: string[]) {
    super(`Invalid questions after retry: ${errors.join('; ')}`);
  }
}

export interface GenerationReport {
  outcome: 'ok' | 'rejected' | 'failed';
  /** 1 or 2 calls to the API. */
  attempts: number;
  durationMs: number;
  /** Validation errors of the first attempt (empty if it was valid or rejected). */
  firstAttemptErrors: string[];
  /** Validation errors of the last attempt when outcome is 'failed'; empty otherwise. */
  errors: string[];
  /** Present only when outcome is 'ok'. */
  batch?: QuestionBatch;
}

/**
 * SPEC §6: Claude with tool use. tool_choice auto (forced tool use is a 400 on current models),
 * both tools strict. A valid submit_questions → shuffled questions with origin 'ai'. Invalid input or
 * no tool call → exactly one retry that sends back the concrete validation errors (tool_result with
 * is_error, or a user message when there was no tool call). Still invalid → GenerationFailedError.
 * reject_topic or stop_reason "refusal" → TopicRejectedError. stop_reason "max_tokens" counts as invalid.
 */
export class ClaudeQuestionSource implements QuestionSource {
  constructor(private readonly options: ClaudeSourceOptions) {}

  async getQuestions(request: QuestionRequest): Promise<QuestionBatch> {
    const report = await this.generate(request);
    if (report.outcome === 'rejected') throw new TopicRejectedError();
    if (report.batch === undefined) throw new GenerationFailedError(report.errors);
    return report.batch;
  }

  /** Like getQuestions, but never throws for rejected/failed topics: returns metrics for the eval. */
  async generate(request: QuestionRequest): Promise<GenerationReport> {
    const { createMessage, model, effort, random, clock } = this.options;
    const startedAt = clock();
    const base = {
      model,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(),
      tools: buildTools(),
      tool_choice: { type: 'auto', disable_parallel_tool_use: true },
      output_config: { effort },
    } satisfies Omit<Anthropic.MessageCreateParamsNonStreaming, 'messages'>;
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: buildUserMessage(request) }];
    let firstAttemptErrors: string[] = [];

    for (let attempt = 1; ; attempt++) {
      // API errors propagate as is: the SDK already retries them.
      const response = await createMessage({ ...base, messages }, { signal: request.signal });
      const result = readResponse(response, request.count);
      const report = { attempts: attempt, durationMs: clock() - startedAt, firstAttemptErrors };

      if (result.kind === 'rejected') return { ...report, outcome: 'rejected', errors: [] };
      if (result.kind === 'ok') {
        return { ...report, outcome: 'ok', errors: [], batch: { questions: shuffleQuestions(result.questions, random), origin: 'ai' } };
      }
      if (attempt === MAX_ATTEMPTS) return { ...report, outcome: 'failed', errors: result.errors };

      firstAttemptErrors = result.errors;
      messages.push({ role: 'assistant', content: response.content }, retryMessage(result));
    }
  }
}

const MAX_TOKENS = 16000;
/** The original call plus one retry with the validation errors. */
const MAX_ATTEMPTS = 2;
const NO_TOOL_CALL = `No tool was called. Call ${SUBMIT_TOOL} with the questions, or ${REJECT_TOOL} if the topic is not allowed.`;

type AttemptResult =
  | { kind: 'ok'; questions: Question[] }
  | { kind: 'rejected' }
  | { kind: 'invalid'; errors: string[]; toolUseId?: string };

function readResponse(response: Anthropic.Message, count: number): AttemptResult {
  if (response.stop_reason === 'refusal') return { kind: 'rejected' };
  const call = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
  if (call === undefined) return { kind: 'invalid', errors: [NO_TOOL_CALL] };
  if (call.name === REJECT_TOOL) return { kind: 'rejected' };
  if (call.name !== SUBMIT_TOOL) return { kind: 'invalid', errors: [`Unknown tool ${call.name}. ${NO_TOOL_CALL}`], toolUseId: call.id };
  if (response.stop_reason === 'max_tokens') {
    return { kind: 'invalid', errors: ['The response was cut off (max_tokens): send shorter questions.'], toolUseId: call.id };
  }
  const validation = validateQuestions(call.input, count);
  return validation.ok ? { kind: 'ok', questions: validation.questions } : { kind: 'invalid', errors: validation.errors, toolUseId: call.id };
}

/** Sends the concrete errors back: as the tool result when there was a call, as text otherwise. */
function retryMessage({ errors, toolUseId }: { errors: string[]; toolUseId?: string }): Anthropic.MessageParam {
  const text = [`Fix these errors and call ${SUBMIT_TOOL} again (or ${REJECT_TOOL}):`, ...errors.map((e) => `- ${e}`)].join('\n');
  if (toolUseId === undefined) return { role: 'user', content: text };
  return { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, is_error: true, content: text }] };
}

import type { Difficulty, Language, Question, QuestionOrigin } from '@preguntica/shared';

export interface QuestionRequest {
  topic: string;
  count: number;
  difficulty: Difficulty;
  language: Language;
  /** Aborted when the caller stops waiting (e.g. the 15 s timeout). */
  signal?: AbortSignal;
}

export interface QuestionBatch {
  questions: Question[];
  origin: QuestionOrigin;
}

/** Where a room's questions come from: Claude, a cache in front of it, or the local bank. */
export interface QuestionSource {
  getQuestions(request: QuestionRequest): Promise<QuestionBatch>;
}

/**
 * The topic is inappropriate or tries to change the instructions (SPEC §6).
 * Never falls back to the local bank and is never cached: the room is closed.
 */
export class TopicRejectedError extends Error {
  override readonly name = 'TopicRejectedError';

  constructor(message = 'Topic rejected') {
    super(message);
  }
}

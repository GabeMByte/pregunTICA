import type { Difficulty, Question } from '@preguntica/shared';

export interface QuestionRequest {
  topic: string;
  count: number;
  difficulty: Difficulty;
}

/** Where a room's questions come from: a local bank today, Claude from day 4. */
export interface QuestionSource {
  getQuestions(request: QuestionRequest): Promise<Question[]>;
}

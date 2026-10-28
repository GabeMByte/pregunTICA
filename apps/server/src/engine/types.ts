import type { AnswerResult, Difficulty, ErrorCode, Phase, Question } from '@preguntica/shared';

export interface Player {
  /** Client-generated UUID; the reconnection secret. Never sent to other clients. */
  id: string;
  nickname: string;
  score: number;
  streak: number;
  connected: boolean;
  /** Result of the last revealed question; null before the first reveal. */
  lastResult: AnswerResult | null;
}

export interface Answer {
  optionIndex: number;
  /** Milliseconds between question start and the answer. */
  elapsedMs: number;
}

export interface GameState {
  code: string;
  topic: string;
  difficulty: Difficulty;
  totalQuestions: number;
  phase: Phase;
  /** Full questions, including answers. Empty while GENERATING. */
  questions: Question[];
  /** In join order, which is also the tie-breaker for rankings. */
  players: Player[];
  /** Index of the current question; null before the game starts. */
  questionIndex: number | null;
  questionStartedAt: number | null;
  questionEndsAt: number | null;
  /** Answers to the current question, keyed by player id. */
  answers: Record<string, Answer>;
}

export type GameAction =
  | { type: 'questionsReady'; questions: Question[] }
  | { type: 'join'; playerId: string; nickname: string }
  | { type: 'disconnect'; playerId: string }
  | { type: 'start' }
  | { type: 'answer'; playerId: string; questionIndex: number; optionIndex: number }
  | { type: 'timeUp' }
  | { type: 'next' };

export type EngineResult = { ok: true; state: GameState } | { ok: false; error: ErrorCode };

export interface NewGame {
  code: string;
  topic: string;
  difficulty: Difficulty;
  count: number;
}

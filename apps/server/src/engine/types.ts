import type { AnswerResult, Difficulty, ErrorCode, Phase, Question, QuestionOrigin } from '@preguntica/shared';

export interface Player {
  /** Client-generated UUID; the reconnection secret. Never sent to other clients. */
  id: string;
  nickname: string;
  score: number;
  streak: number;
  connected: boolean;
  /**
   * When the player last disconnected (injected time); null while connected. For DISCONNECT_GRACE_MS
   * it still counts as pending, so a reload does not end the question (SPEC §3 Desconexiones).
   */
  disconnectedAt: number | null;
  /** Result of the last revealed question; null before the first reveal. */
  lastResult: AnswerResult | null;
  /** Index of the first question this player takes part in (0 unless it joined mid-game). */
  eligibleFrom: number;
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
  /** Where the questions came from; null while GENERATING. */
  questionOrigin: QuestionOrigin | null;
  /** Ids of players the host kicked out, in kick order: they cannot join again with the same id. */
  kickedIds: string[];
}

export type GameAction =
  | { type: 'questionsReady'; questions: Question[]; origin: QuestionOrigin }
  | { type: 'join'; playerId: string; nickname: string }
  | { type: 'disconnect'; playerId: string }
  | { type: 'start' }
  | { type: 'answer'; playerId: string; questionIndex: number; optionIndex: number }
  | { type: 'timeUp' }
  | { type: 'next' }
  | { type: 'kick'; nickname: string };

export type EngineResult = { ok: true; state: GameState } | { ok: false; error: ErrorCode };

export interface NewGame {
  code: string;
  topic: string;
  difficulty: Difficulty;
  count: number;
}

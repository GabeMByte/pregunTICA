import {
  MAX_PLAYERS,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  OPTIONS_PER_QUESTION,
  QUESTION_TIME_MS,
  type ErrorCode,
  type Question,
} from '@preguntica/shared';
import { scoreAnswer } from './scoring.js';
import type { EngineResult, GameAction, GameState, NewGame, Player } from './types.js';

export function createGame({ code, topic, difficulty, count }: NewGame): GameState {
  return {
    code,
    topic,
    difficulty,
    totalQuestions: count,
    phase: 'GENERATING',
    questions: [],
    players: [],
    questionIndex: null,
    questionStartedAt: null,
    questionEndsAt: null,
    answers: {},
  };
}

export function reduce(state: GameState, action: GameAction, now: number): EngineResult {
  switch (action.type) {
    case 'questionsReady':
      return questionsReady(state, action.questions);
    case 'join':
      return join(state, action.playerId, action.nickname);
    case 'disconnect':
      return disconnect(state, action.playerId);
    case 'start':
      return start(state, now);
    case 'timeUp':
      return timeUp(state, now);
    case 'next':
      return next(state, now);
    case 'answer':
      return answer(state, action.playerId, action.questionIndex, action.optionIndex, now);
  }
}

const success = (state: GameState): EngineResult => ({ ok: true, state });
const failure = (error: ErrorCode): EngineResult => ({ ok: false, error });

function questionsReady(state: GameState, questions: Question[]): EngineResult {
  if (state.phase !== 'GENERATING') return failure('INVALID_PHASE');
  if (questions.length === 0) return failure('INVALID_PAYLOAD');
  return success({ ...state, phase: 'LOBBY', questions, totalQuestions: questions.length });
}

function join(state: GameState, playerId: string, rawNickname: string): EngineResult {
  if (hasPlayer(state, playerId)) {
    return success(updatePlayer(state, playerId, { connected: true }));
  }

  if (state.phase === 'PODIUM') return failure('INVALID_PHASE');

  const nickname = rawNickname.trim();
  if (nickname.length < NICKNAME_MIN_LENGTH || nickname.length > NICKNAME_MAX_LENGTH) {
    return failure('INVALID_PAYLOAD');
  }
  const taken = nickname.toLowerCase();
  if (state.players.some((p) => p.nickname.toLowerCase() === taken)) return failure('NICKNAME_TAKEN');
  if (state.players.length >= MAX_PLAYERS) return failure('ROOM_FULL');

  // SPEC §3 Jugadores tardíos: mid-game joiners take part from the next question.
  const eligibleFrom = state.questionIndex === null ? 0 : state.questionIndex + 1;
  const player: Player = { id: playerId, nickname, score: 0, streak: 0, connected: true, lastResult: null, eligibleFrom };
  return success({ ...state, players: [...state.players, player] });
}

function disconnect(state: GameState, playerId: string): EngineResult {
  if (!hasPlayer(state, playerId)) return failure('PLAYER_NOT_FOUND');
  return success(revealIfEveryoneAnswered(updatePlayer(state, playerId, { connected: false })));
}

function answer(state: GameState, playerId: string, questionIndex: number, optionIndex: number, now: number): EngineResult {
  if (state.phase !== 'QUESTION' || state.questionStartedAt === null || state.questionEndsAt === null) {
    return failure('INVALID_PHASE');
  }
  const player = state.players.find((p) => p.id === playerId);
  if (player === undefined) return failure('PLAYER_NOT_FOUND');
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= OPTIONS_PER_QUESTION) {
    return failure('INVALID_PAYLOAD');
  }
  if (questionIndex !== state.questionIndex || now > state.questionEndsAt || !isEligible(player, questionIndex)) {
    return failure('INVALID_PHASE');
  }
  // SPEC §3: only the first answer counts.
  if (Object.hasOwn(state.answers, playerId)) return success(state);

  const answers = { ...state.answers, [playerId]: { optionIndex, elapsedMs: now - state.questionStartedAt } };
  return success(revealIfEveryoneAnswered({ ...state, answers }));
}

function start(state: GameState, now: number): EngineResult {
  if (state.phase === 'GENERATING') return failure('QUESTIONS_NOT_READY');
  if (state.phase !== 'LOBBY') return failure('INVALID_PHASE');
  if (!state.players.some((p) => p.connected)) return failure('NO_PLAYERS');
  return success(beginQuestion(state, 0, now));
}

/** Stale or early timers are harmless no-ops. */
function timeUp(state: GameState, now: number): EngineResult {
  if (state.phase !== 'QUESTION' || state.questionEndsAt === null || now < state.questionEndsAt) {
    return success(state);
  }
  return success(reveal(state));
}

function next(state: GameState, now: number): EngineResult {
  if (state.phase === 'REVEAL') return success({ ...state, phase: 'LEADERBOARD' });
  if (state.phase !== 'LEADERBOARD' || state.questionIndex === null) return failure('INVALID_PHASE');

  const nextIndex = state.questionIndex + 1;
  if (nextIndex >= state.totalQuestions) return success({ ...state, phase: 'PODIUM' });
  return success(beginQuestion(state, nextIndex, now));
}

function beginQuestion(state: GameState, questionIndex: number, now: number): GameState {
  return {
    ...state,
    phase: 'QUESTION',
    questionIndex,
    questionStartedAt: now,
    questionEndsAt: now + QUESTION_TIME_MS,
    answers: {},
  };
}

function revealIfEveryoneAnswered(state: GameState): GameState {
  if (state.phase !== 'QUESTION' || state.questionIndex === null) return state;
  const questionIndex = state.questionIndex;
  const pending = state.players.some(
    (p) => p.connected && isEligible(p, questionIndex) && !Object.hasOwn(state.answers, p.id),
  );
  return pending ? state : reveal(state);
}

/** Enters REVEAL and applies SPEC §3 Puntaje to every eligible player, answered or not. */
function reveal(state: GameState): GameState {
  const questionIndex = state.questionIndex;
  const question = questionIndex === null ? undefined : state.questions[questionIndex];
  if (questionIndex === null || question === undefined) throw new Error('reveal() requires a current question');

  const players = state.players.map((player): Player => {
    // Late joiners did not take part in this question: leave them untouched.
    if (!isEligible(player, questionIndex)) return player;
    const playerAnswer = state.answers[player.id];
    const correct = playerAnswer?.optionIndex === question.correctIndex;
    const { points, streak } = scoreAnswer({
      correct,
      elapsedMs: playerAnswer?.elapsedMs ?? QUESTION_TIME_MS,
      limitMs: QUESTION_TIME_MS,
      previousStreak: player.streak,
    });
    const score = player.score + points;
    return {
      ...player,
      score,
      streak,
      lastResult: { correct, points, streak, totalScore: score },
    };
  });

  return { ...state, phase: 'REVEAL', players };
}

function updatePlayer(state: GameState, playerId: string, changes: Partial<Player>): GameState {
  return { ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, ...changes } : p)) };
}

function isEligible(player: Player, questionIndex: number): boolean {
  return questionIndex >= player.eligibleFrom;
}

function hasPlayer(state: GameState, playerId: string): boolean {
  return state.players.some((p) => p.id === playerId);
}

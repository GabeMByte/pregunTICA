import { MAX_PLAYERS, NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH, type ErrorCode, type Question } from '@preguntica/shared';
import { notImplemented } from './not-implemented.js';
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
    case 'answer':
    case 'timeUp':
    case 'next':
      return notImplemented(state, action, now);
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
  if (state.players.some((p) => p.id === playerId)) {
    return success(updatePlayer(state, playerId, { connected: true }));
  }

  if (state.phase !== 'GENERATING' && state.phase !== 'LOBBY') return failure('INVALID_PHASE');

  const nickname = rawNickname.trim();
  if (nickname.length < NICKNAME_MIN_LENGTH || nickname.length > NICKNAME_MAX_LENGTH) {
    return failure('INVALID_PAYLOAD');
  }
  const taken = nickname.toLowerCase();
  if (state.players.some((p) => p.nickname.toLowerCase() === taken)) return failure('NICKNAME_TAKEN');
  if (state.players.length >= MAX_PLAYERS) return failure('ROOM_FULL');

  const player: Player = { id: playerId, nickname, score: 0, streak: 0, connected: true, lastResult: null };
  return success({ ...state, players: [...state.players, player] });
}

function disconnect(state: GameState, playerId: string): EngineResult {
  if (!state.players.some((p) => p.id === playerId)) return failure('PLAYER_NOT_FOUND');
  return success(updatePlayer(state, playerId, { connected: false }));
}

function updatePlayer(state: GameState, playerId: string, changes: Partial<Player>): GameState {
  return { ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, ...changes } : p)) };
}

import { MAX_PLAYERS, type ErrorCode, type ErrorPayload, type PublicPlayer } from '@preguntica/shared';
import type { PlayerState } from './playerReducer.js';

export type PlayerScreen =
  | 'join'
  | 'connecting'
  | 'reconnecting'
  | 'kicked'
  | 'lobby'
  | 'preparing'
  | 'question'
  | 'reveal'
  | 'leaderboard'
  | 'podium';

/**
 * Which screen the player sees. The server sends room:state before the data of a new phase, so a
 * phase whose data has not arrived is 'preparing': never the previous question or a stale result.
 */
export function playerScreen(state: PlayerState): PlayerScreen {
  if (state.podium !== null) return 'podium';
  if (state.error?.code === 'KICKED') return 'kicked';
  if (state.session === null) return 'join';
  if (state.connection === 'disconnected') return 'reconnecting';
  if (state.room === null) return state.error === null ? 'connecting' : 'join';
  if (state.waitingForNextQuestion) return 'lobby';

  switch (state.room.phase) {
    case 'GENERATING':
    case 'LOBBY':
      return 'lobby';
    case 'QUESTION':
      return state.question?.index === state.room.questionIndex ? 'question' : 'preparing';
    case 'REVEAL':
      return state.reveal === null ? 'preparing' : 'reveal';
    case 'LEADERBOARD':
      return state.leaderboard === null ? 'preparing' : 'leaderboard';
    case 'PODIUM':
      return 'preparing';
  }
}

export interface PlayerRank {
  rank: number;
  total: number;
}

/**
 * The player's position, from room:state because `leaderboard` and `podium` only carry the top.
 * Same order as the server's ranking(): score descending, ties in join order (the stable sort).
 */
export function playerRank(players: readonly PublicPlayer[], nickname: string | null): PlayerRank | null {
  const index = [...players].sort((a, b) => b.score - a.score).findIndex((player) => player.nickname === nickname);
  return index === -1 ? null : { rank: index + 1, total: players.length };
}

/**
 * The timer's end on the local clock. endsAt comes from the server's clock, so it is trusted only
 * when the time left is plausible; a phone with a wrong clock counts the full time from now.
 */
export function localDeadline(endsAt: number, receivedAt: number, durationMs: number): number {
  const remaining = endsAt - receivedAt;
  return remaining > 0 && remaining <= durationMs ? endsAt : receivedAt + durationMs;
}

const JOIN_ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {
  NICKNAME_TAKEN: 'Ese apodo ya está en uso en esta sala. Prueba con otro.',
  ROOM_NOT_FOUND: 'No encontramos esa sala. Revisa el código.',
  ROOM_FULL: `La sala está llena: ya tiene ${String(MAX_PLAYERS)} jugadores.`,
  RATE_LIMITED: 'Demasiados intentos. Espera un minuto y vuelve a probar.',
  // The only phase that refuses a new player.
  INVALID_PHASE: 'Esta partida ya terminó.',
};

export function joinErrorMessage(error: ErrorPayload): string {
  return JOIN_ERROR_MESSAGES[error.code] ?? error.message;
}

export type JoinField = 'roomCode' | 'nickname' | 'form';

/** Where the error is shown, next to the field that has to change. */
export function joinErrorField(code: ErrorCode): JoinField {
  if (code === 'NICKNAME_TAKEN') return 'nickname';
  return code === 'ROOM_NOT_FOUND' ? 'roomCode' : 'form';
}

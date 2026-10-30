import type {
  LeaderboardEntry,
  PodiumEntry,
  QuestionRevealPayload,
  QuestionStartPayload,
  RoomStatePayload,
} from '@preguntica/shared';
import type { HostState } from './hostReducer.js';

export type HostScreen =
  | { name: 'form' }
  | { name: 'recovering' }
  | { name: 'waiting'; room: RoomStatePayload }
  | { name: 'lobby'; room: RoomStatePayload }
  | { name: 'question'; room: RoomStatePayload; question: QuestionStartPayload }
  | { name: 'reveal'; room: RoomStatePayload; reveal: QuestionRevealPayload }
  | { name: 'leaderboard'; room: RoomStatePayload; entries: LeaderboardEntry[] }
  | { name: 'podium'; entries: PodiumEntry[] };

/**
 * The phase decides the screen. room:state always comes before the phase's own event, so a payload
 * that has not arrived yet (or belongs to the previous question) means "wait", never "draw it".
 */
export function selectHostScreen({ session, room, question, reveal, leaderboard, podium }: HostState): HostScreen {
  // game:end ends the session, but the podium stays on screen.
  if (podium !== null) return { name: 'podium', entries: podium };
  if (session === null) return { name: 'form' };
  if (room === null) return { name: 'recovering' };

  switch (room.phase) {
    case 'GENERATING':
    case 'LOBBY':
      return { name: 'lobby', room };
    case 'QUESTION':
      return question?.index === room.questionIndex ? { name: 'question', room, question } : { name: 'waiting', room };
    case 'REVEAL':
      return reveal === null ? { name: 'waiting', room } : { name: 'reveal', room, reveal };
    case 'LEADERBOARD':
      return leaderboard === null ? { name: 'waiting', room } : { name: 'leaderboard', room, entries: leaderboard };
    case 'PODIUM':
      return { name: 'waiting', room };
  }
}

/** Same rule as the engine's start: the lobby and at least one connected player. */
export function canStart({ room, connection }: Pick<HostState, 'room' | 'connection'>): boolean {
  return connection === 'connected' && room?.phase === 'LOBBY' && room.players.some((p) => p.connected);
}

/** Only before the game starts: players see the projector too, and the fallback bank is public (SPEC §5). */
export function showsFallbackNotice(room: RoomStatePayload | null): boolean {
  return room !== null && (room.phase === 'GENERATING' || room.phase === 'LOBBY') && room.questionOrigin === 'fallback';
}

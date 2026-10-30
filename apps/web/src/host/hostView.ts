import {
  QUESTION_TIME_MS,
  type Difficulty,
  type Language,
  type LeaderboardEntry,
  type PodiumEntry,
  type QuestionRevealPayload,
  type QuestionStartPayload,
  type RoomStatePayload,
} from '@preguntica/shared';
import type { HostState } from './hostReducer.js';

/** What the form holds; kept by the page so it comes back filled in after a rejected topic. */
export interface FormDraft {
  topic: string;
  count: number;
  difficulty: Difficulty;
  language: Language;
}

export const EMPTY_DRAFT: FormDraft = { topic: '', count: 5, difficulty: 'medium', language: 'es' };

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

/**
 * Timer expects the local clock and endsAt comes from the server's. A question never lasts longer
 * than its limit, which corrects a local clock running behind; one running ahead only shows less time.
 */
export function localEndsAt(serverEndsAt: number, now: number): number {
  return Math.min(serverEndsAt, now + QUESTION_TIME_MS);
}

/**
 * How many places each entry climbed with the last question (negative: it fell). The previous order
 * comes from score - delta, so it only knows about the players who are in the top now.
 */
export function rankShifts(entries: readonly LeaderboardEntry[]): number[] {
  const before = entries.map((entry, index) => ({ index, previous: entry.score - entry.delta }));
  const order = before.sort((a, b) => b.previous - a.previous).map((entry) => entry.index);
  return entries.map((_, index) => order.indexOf(index) - index);
}

export function joinUrl(origin: string, roomCode: string): string {
  return `${origin}/play/${roomCode}`;
}

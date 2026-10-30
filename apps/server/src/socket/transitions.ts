import type { Phase, ServerEvent, ServerToClientEvents } from '@preguntica/shared';
import {
  toHostRoomState,
  toLeaderboard,
  toPodium,
  toQuestionStart,
  toReveal,
  toRoomState,
  type GameState,
  type Player,
} from '../engine/index.js';

/** A typed S→C event. The union keeps each event paired with its own payload type. */
export type Message = { [E in ServerEvent]: { event: E; payload: Parameters<ServerToClientEvents[E]>[0] } }[ServerEvent];

/** 'players': everyone in the room except the host. */
export type Target = { kind: 'room' } | { kind: 'players' } | { kind: 'host' } | { kind: 'player'; playerId: string };
export type Emission = Message & { to: Target };

export type Viewer = { role: 'host' } | { role: 'player'; playerId: string };

const ROOM: Target = { kind: 'room' };
const HOST: Target = { kind: 'host' };
const PLAYERS: Target = { kind: 'players' };

/** What each client must receive after the room went from `previous` to `next`. */
export function eventsForTransition(previous: GameState, next: GameState): Emission[] {
  const emissions: Emission[] = [
    { to: HOST, event: 'room:state', payload: toHostRoomState(next) },
    { to: PLAYERS, event: 'room:state', payload: toRoomState(next) },
  ];

  const question = toQuestionStart(next);
  if (question !== null && isNewQuestion(previous, next)) {
    emissions.push({ to: ROOM, event: 'question:start', payload: question });
  }

  if (entered(previous, next, 'REVEAL')) {
    // One copy per player so each sees only its own result; the host gets none.
    const reveal = toReveal(next);
    if (reveal !== null) emissions.push({ to: HOST, event: 'question:reveal', payload: reveal });
    for (const player of next.players) {
      const own = toReveal(next, player.id);
      if (own !== null) emissions.push({ to: { kind: 'player', playerId: player.id }, event: 'question:reveal', payload: own });
    }
  }

  if (entered(previous, next, 'LEADERBOARD')) {
    emissions.push({ to: ROOM, event: 'leaderboard', payload: toLeaderboard(next) });
  }

  if (entered(previous, next, 'PODIUM')) {
    emissions.push({ to: ROOM, event: 'game:end', payload: toPodium(next) });
  }

  return emissions;
}

/** Everything a client that (re)joins needs to render the current phase. */
export function snapshotFor(state: GameState, viewer: Viewer): Message[] {
  const player = viewer.role === 'player' ? state.players.find((p) => p.id === viewer.playerId) : undefined;
  const waiting = player !== undefined && isWaitingForNextQuestion(state, player);
  const messages: Message[] = [];

  if (player !== undefined) {
    messages.push({
      event: 'player:joined',
      payload: { playerId: player.id, nickname: player.nickname, waitingForNextQuestion: waiting },
    });
  }
  messages.push({ event: 'room:state', payload: viewer.role === 'host' ? toHostRoomState(state) : toRoomState(state) });

  switch (state.phase) {
    case 'QUESTION': {
      // SPEC §3: a late joiner does not get the question in progress.
      const question = toQuestionStart(state);
      if (question !== null && !waiting) messages.push({ event: 'question:start', payload: question });
      break;
    }
    case 'REVEAL': {
      const reveal = toReveal(state, player?.id);
      if (reveal !== null) messages.push({ event: 'question:reveal', payload: reveal });
      break;
    }
    case 'LEADERBOARD':
      messages.push({ event: 'leaderboard', payload: toLeaderboard(state) });
      break;
    case 'PODIUM':
      messages.push({ event: 'game:end', payload: toPodium(state) });
      break;
    case 'GENERATING':
    case 'LOBBY':
      break;
  }
  return messages;
}

/** True when the player joined mid-game and takes part from a later question. */
export function isWaitingForNextQuestion(state: GameState, player: Player): boolean {
  return state.questionIndex !== null && state.questionIndex < player.eligibleFrom;
}

function entered(previous: GameState, next: GameState, phase: Phase): boolean {
  return next.phase === phase && previous.phase !== phase;
}

function isNewQuestion(previous: GameState, next: GameState): boolean {
  return next.phase === 'QUESTION' && (previous.phase !== 'QUESTION' || previous.questionIndex !== next.questionIndex);
}

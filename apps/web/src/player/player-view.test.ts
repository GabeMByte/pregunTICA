import { describe, expect, it } from 'vitest';
import { PLAYER_ID, QUESTION, REVEAL, ROOM_CODE, ROOM_STATE } from '../game/fixtures.js';
import { joinErrorField, localDeadline, playerRank, playerScreen } from './player-view.js';
import { initialPlayerState, playerReducer, type PlayerState } from './playerReducer.js';

const SESSION = { roomCode: ROOM_CODE, playerId: PLAYER_ID, nickname: 'Tica' };
const DURATION = 20_000;
const NOW = 1_000_000;

function state(changes: Partial<PlayerState> = {}): PlayerState {
  return { ...initialPlayerState(SESSION), connection: 'connected', room: ROOM_STATE, ...changes };
}

const inPhase = (phase: 'QUESTION' | 'REVEAL' | 'LEADERBOARD' | 'PODIUM', questionIndex = 0) => ({ ...ROOM_STATE, phase, questionIndex });

describe('playerScreen', () => {
  it('without a session it asks to join', () => {
    expect(playerScreen(state({ session: null, room: null }))).toBe('join');
  });

  it('waits for the room after a reload', () => {
    expect(playerScreen(state({ room: null }))).toBe('connecting');
  });

  it('a rejoin the server refused goes back to the form', () => {
    expect(playerScreen(state({ room: null, error: { code: 'NICKNAME_TAKEN', message: 'x' } }))).toBe('join');
  });

  it('a lost connection shows the reconnecting screen', () => {
    expect(playerScreen(state({ connection: 'disconnected' }))).toBe('reconnecting');
  });

  it('a kicked player sees why, whatever the rest of the state says', () => {
    expect(playerScreen(state({ session: null, room: null, error: { code: 'KICKED', message: 'x' } }))).toBe('kicked');
  });

  it('the podium survives a lost connection and the ended session', () => {
    expect(playerScreen(state({ session: null, connection: 'disconnected', podium: [] }))).toBe('podium');
  });

  it.each(['GENERATING', 'LOBBY'] as const)('%s is the lobby', (phase) => {
    expect(playerScreen(state({ room: { ...ROOM_STATE, phase } }))).toBe('lobby');
  });

  it('shows the question once it matches the room', () => {
    expect(playerScreen(state({ room: inPhase('QUESTION'), question: QUESTION }))).toBe('question');
  });

  it('never shows the previous question while the next one is on its way', () => {
    expect(playerScreen(state({ room: inPhase('QUESTION', 1), question: QUESTION, reveal: REVEAL }))).toBe('preparing');
  });

  it('shows the reveal only when it arrived', () => {
    expect(playerScreen(state({ room: inPhase('REVEAL') }))).toBe('preparing');
    expect(playerScreen(state({ room: inPhase('REVEAL'), reveal: REVEAL }))).toBe('reveal');
  });

  it('shows the leaderboard only when it arrived', () => {
    expect(playerScreen(state({ room: inPhase('LEADERBOARD') }))).toBe('preparing');
    expect(playerScreen(state({ room: inPhase('LEADERBOARD'), leaderboard: [] }))).toBe('leaderboard');
  });

  it('PODIUM waits for game:end', () => {
    expect(playerScreen(state({ room: inPhase('PODIUM') }))).toBe('preparing');
  });

  it.each(['QUESTION', 'REVEAL', 'LEADERBOARD'] as const)('a late joiner waits in the lobby during %s', (phase) => {
    expect(playerScreen(state({ room: inPhase(phase), waitingForNextQuestion: true }))).toBe('lobby');
  });

  it('real order: room:state first, then the data', () => {
    let current = state({ room: inPhase('LEADERBOARD'), leaderboard: [] });
    current = playerReducer(current, { type: 'room:state', payload: inPhase('QUESTION', 1) });
    expect(playerScreen(current)).toBe('preparing');
    current = playerReducer(current, { type: 'question:start', payload: { ...QUESTION, index: 1 } });
    expect(playerScreen(current)).toBe('question');
  });
});

describe('playerRank', () => {
  const player = (nickname: string, score: number) => ({ nickname, score, connected: true });

  it('ranks by score, descending', () => {
    expect(playerRank([player('A', 100), player('B', 300), player('C', 200)], 'A')).toEqual({ rank: 3, total: 3 });
  });

  it('ties keep join order, like the server ranking', () => {
    const players = [player('A', 100), player('B', 100)];
    expect(playerRank(players, 'A')?.rank).toBe(1);
    expect(playerRank(players, 'B')?.rank).toBe(2);
  });

  it('finds players outside the top 5', () => {
    const players = Array.from({ length: 12 }, (_, i) => player(`P${String(i)}`, 1000 - i));
    expect(playerRank(players, 'P11')).toEqual({ rank: 12, total: 12 });
  });

  it('an unknown player has no rank', () => {
    expect(playerRank([player('A', 1)], 'B')).toBeNull();
    expect(playerRank([player('A', 1)], null)).toBeNull();
  });

  it('does not reorder the room state', () => {
    const players = [player('A', 1), player('B', 2)];
    playerRank(players, 'A');
    expect(players[0]?.nickname).toBe('A');
  });
});

describe('localDeadline', () => {
  it('trusts endsAt when the time left is plausible', () => {
    expect(localDeadline(NOW + 12_000, NOW, DURATION)).toBe(NOW + 12_000);
  });

  it('a phone clock running behind never shows more than the full time', () => {
    expect(localDeadline(NOW + 80_000, NOW, DURATION)).toBe(NOW + DURATION);
  });

  it('a phone clock running ahead does not start at zero', () => {
    expect(localDeadline(NOW - 60_000, NOW, DURATION)).toBe(NOW + DURATION);
  });
});

describe('joinErrorField', () => {
  it('points to the field to fix', () => {
    expect(joinErrorField('NICKNAME_TAKEN')).toBe('nickname');
    expect(joinErrorField('ROOM_NOT_FOUND')).toBe('roomCode');
    expect(joinErrorField('ROOM_FULL')).toBe('form');
  });
});

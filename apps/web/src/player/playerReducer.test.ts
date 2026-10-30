import { describe, expect, it } from 'vitest';
import { PLAYER_ID, QUESTION, REVEAL, ROOM_CODE, ROOM_STATE } from '../game/fixtures.js';
import { canAnswer, initialPlayerState, playerReducer, type PlayerState } from './playerReducer.js';

const SESSION = { roomCode: ROOM_CODE, playerId: PLAYER_ID, nickname: 'Tica' };

function inQuestion(): PlayerState {
  return playerReducer(initialPlayerState(SESSION), { type: 'question:start', payload: QUESTION });
}

describe('playerReducer', () => {
  it('player:joined stores the session with the server nickname', () => {
    const state = playerReducer(initialPlayerState(null), {
      type: 'player:joined',
      payload: { playerId: PLAYER_ID, nickname: 'Tica', waitingForNextQuestion: true },
      roomCode: ROOM_CODE,
    });
    expect(state.session).toEqual(SESSION);
    expect(state.waitingForNextQuestion).toBe(true);
  });

  it('records one answer per question', () => {
    let state = playerReducer(inQuestion(), { type: 'answer', optionIndex: 2 });
    expect(state.selectedOption).toBe(2);
    state = playerReducer(state, { type: 'answer', optionIndex: 1 });
    expect(state.selectedOption).toBe(2);
  });

  it('cannot answer without a question, after the reveal, or while waiting for the next one', () => {
    expect(canAnswer(initialPlayerState(SESSION))).toBe(false);
    expect(canAnswer(playerReducer(inQuestion(), { type: 'question:reveal', payload: REVEAL }))).toBe(false);
    expect(canAnswer({ ...inQuestion(), waitingForNextQuestion: true })).toBe(false);
    expect(canAnswer(inQuestion())).toBe(true);
  });

  it('a new question resets the answer and the waiting flag', () => {
    let state = playerReducer({ ...inQuestion(), waitingForNextQuestion: true }, { type: 'question:start', payload: { ...QUESTION, index: 1 } });
    expect(state.waitingForNextQuestion).toBe(false);
    state = playerReducer(state, { type: 'answer', optionIndex: 0 });
    state = playerReducer(state, { type: 'question:start', payload: { ...QUESTION, index: 2 } });
    expect(state.selectedOption).toBeNull();
  });

  it('the same question again (a reconnection snapshot) keeps the answer', () => {
    const answered = playerReducer(inQuestion(), { type: 'answer', optionIndex: 2 });
    const state = playerReducer(answered, { type: 'question:start', payload: QUESTION });
    expect(state.selectedOption).toBe(2);
    expect(canAnswer(state)).toBe(false);
  });

  it.each(['KICKED', 'ROOM_NOT_FOUND'] as const)('%s ends the session', (code) => {
    const state = playerReducer(initialPlayerState(SESSION), { type: 'error', payload: { code, message: 'x' } });
    expect(state.session).toBeNull();
    expect(state.error?.code).toBe(code);
  });

  it('a session-ending error drops the game it belonged to', () => {
    const revealed = playerReducer(inQuestion(), { type: 'question:reveal', payload: REVEAL });
    const inRoom = playerReducer(revealed, { type: 'room:state', payload: ROOM_STATE });
    const state = playerReducer(inRoom, { type: 'error', payload: { code: 'ROOM_NOT_FOUND', message: 'x' } });
    expect(state.room).toBeNull();
    expect(state.question).toBeNull();
    expect(state.reveal).toBeNull();
    expect(state.leaderboard).toBeNull();
    expect(state.selectedOption).toBeNull();
  });

  it('joining is pending until the server answers', () => {
    const pending = playerReducer(initialPlayerState(null), { type: 'joining' });
    expect(pending.joining).toBe(true);
    const joined = playerReducer(pending, {
      type: 'player:joined',
      payload: { playerId: PLAYER_ID, nickname: 'Tica', waitingForNextQuestion: false },
      roomCode: ROOM_CODE,
    });
    expect(joined.joining).toBe(false);
    expect(playerReducer(pending, { type: 'error', payload: { code: 'ROOM_FULL', message: 'x' } }).joining).toBe(false);
    expect(playerReducer(pending, { type: 'connection', status: 'disconnected' }).joining).toBe(false);
  });

  it('a new join clears the previous error', () => {
    const failed = playerReducer(initialPlayerState(null), { type: 'error', payload: { code: 'ROOM_FULL', message: 'x' } });
    expect(playerReducer(failed, { type: 'joining' }).error).toBeNull();
  });

  it('NICKNAME_TAKEN keeps the session', () => {
    const state = playerReducer(initialPlayerState(SESSION), { type: 'error', payload: { code: 'NICKNAME_TAKEN', message: 'x' } });
    expect(state.session).toEqual(SESSION);
  });

  it('game:end keeps the podium and ends the session', () => {
    const state = playerReducer(initialPlayerState(SESSION), {
      type: 'game:end',
      payload: { podium: [{ rank: 1, nickname: 'Tica', score: 900 }] },
    });
    expect(state.podium).toHaveLength(1);
    expect(state.session).toBeNull();
    expect(state.finalNickname).toBe('Tica');
  });
});

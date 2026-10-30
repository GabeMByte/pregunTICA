import { describe, expect, it } from 'vitest';
import { PLAYER_ID, QUESTION, REVEAL, ROOM_CODE } from '../game/fixtures.js';
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

  it.each(['KICKED', 'ROOM_NOT_FOUND'] as const)('%s ends the session', (code) => {
    const state = playerReducer(initialPlayerState(SESSION), { type: 'error', payload: { code, message: 'x' } });
    expect(state.session).toBeNull();
    expect(state.error?.code).toBe(code);
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
  });
});

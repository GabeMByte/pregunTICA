import { describe, expect, it } from 'vitest';
import { HOST_TOKEN, QUESTION, REVEAL, ROOM_CODE, ROOM_STATE } from '../game/fixtures.js';
import { hostReducer, initialHostState } from './hostReducer.js';

const SESSION = { roomCode: ROOM_CODE, hostToken: HOST_TOKEN };

describe('hostReducer', () => {
  it('starts connecting, with the stored session if any', () => {
    expect(initialHostState(null)).toMatchObject({ connection: 'connecting', session: null, room: null });
    expect(initialHostState(SESSION).session).toEqual(SESSION);
  });

  it('host:created stores the session and clears a previous error', () => {
    const errored = hostReducer(initialHostState(null), { type: 'error', payload: { code: 'TOPIC_REJECTED', message: 'x' } });
    const state = hostReducer(errored, { type: 'host:created', payload: SESSION });
    expect(state.session).toEqual(SESSION);
    expect(state.error).toBeNull();
  });

  it('tracks the connection status', () => {
    const state = hostReducer(initialHostState(null), { type: 'connection', status: 'disconnected' });
    expect(state.connection).toBe('disconnected');
  });

  it('room:state replaces the room', () => {
    const state = hostReducer(initialHostState(SESSION), { type: 'room:state', payload: ROOM_STATE });
    expect(state.room).toEqual(ROOM_STATE);
  });

  it('a new question clears the previous reveal and leaderboard', () => {
    let state = hostReducer(initialHostState(SESSION), { type: 'question:start', payload: QUESTION });
    state = hostReducer(state, { type: 'question:reveal', payload: REVEAL });
    state = hostReducer(state, { type: 'leaderboard', payload: { top: [{ nickname: 'Tica', score: 900, delta: 900 }] } });
    expect(state.reveal).toEqual(REVEAL);
    expect(state.leaderboard).toHaveLength(1);
    state = hostReducer(state, { type: 'question:start', payload: { ...QUESTION, index: 1 } });
    expect(state.question?.index).toBe(1);
    expect(state.reveal).toBeNull();
    expect(state.leaderboard).toBeNull();
  });

  it('game:end keeps the podium and ends the session', () => {
    const state = hostReducer(initialHostState(SESSION), {
      type: 'game:end',
      payload: { podium: [{ rank: 1, nickname: 'Tica', score: 900 }] },
    });
    expect(state.podium).toHaveLength(1);
    expect(state.session).toBeNull();
  });

  it('ROOM_NOT_FOUND ends the session', () => {
    const state = hostReducer(initialHostState(SESSION), { type: 'error', payload: { code: 'ROOM_NOT_FOUND', message: 'x' } });
    expect(state.session).toBeNull();
    expect(state.error?.code).toBe('ROOM_NOT_FOUND');
  });

  it('other errors keep the session and can be dismissed', () => {
    let state = hostReducer(initialHostState(SESSION), { type: 'error', payload: { code: 'NO_PLAYERS', message: 'x' } });
    expect(state.session).toEqual(SESSION);
    state = hostReducer(state, { type: 'error:dismiss' });
    expect(state.error).toBeNull();
  });
});

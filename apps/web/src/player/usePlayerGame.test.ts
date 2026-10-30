import { ServerEvents } from '@preguntica/shared';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OTHER_PLAYER_ID, PLAYER_ID, QUESTION, REVEAL, ROOM_CODE } from '../game/fixtures.js';
import { FakeSocket } from '../net/fake-socket.js';
import { PLAYER_KEY, readPlayerSession, savePlayerSession } from '../net/storage.js';
import { usePlayerGame } from './usePlayerGame.js';

const SESSION = { roomCode: ROOM_CODE, playerId: PLAYER_ID, nickname: 'Tica' };
let fake: FakeSocket;
const createSocket = () => fake.asGameSocket();
const newPlayerId = () => OTHER_PLAYER_ID;

function setup() {
  return renderHook(() => usePlayerGame({ createSocket, newPlayerId }));
}

function joined(waitingForNextQuestion = false) {
  act(() => {
    fake.receive(ServerEvents.PlayerJoined, { playerId: OTHER_PLAYER_ID, nickname: 'Tica', waitingForNextQuestion });
  });
}

beforeEach(() => {
  fake = new FakeSocket();
});

afterEach(() => {
  localStorage.clear();
});

describe('usePlayerGame', () => {
  it('join sends a new device-generated playerId', () => {
    const { result } = setup();
    act(() => {
      result.current.join(ROOM_CODE, 'Tica');
    });
    expect(fake.emitted).toContainEqual({
      event: 'player:join',
      payload: { roomCode: ROOM_CODE, nickname: 'Tica', playerId: OTHER_PLAYER_ID },
    });
  });

  it('player:joined saves the session in localStorage', () => {
    const { result } = setup();
    act(() => {
      result.current.join(ROOM_CODE, 'Tica');
    });
    joined();
    const expected = { roomCode: ROOM_CODE, playerId: OTHER_PLAYER_ID, nickname: 'Tica' };
    expect(readPlayerSession()).toEqual(expected);
    expect(result.current.state.session).toEqual(expected);
  });

  it('player:joined without a pending join is ignored', () => {
    const { result } = setup();
    joined();
    expect(result.current.state.session).toBeNull();
    expect(readPlayerSession()).toBeNull();
  });

  it('with a stored session it rejoins as the same player on connect', () => {
    savePlayerSession(SESSION);
    setup();
    expect(fake.emitted).toContainEqual({ event: 'player:join', payload: SESSION });
  });

  it('joining the stored room again reuses the stored playerId', () => {
    savePlayerSession(SESSION);
    const { result } = setup();
    act(() => {
      result.current.join(ROOM_CODE, 'Tica');
    });
    expect(fake.emitted.at(-1)).toEqual({ event: 'player:join', payload: { roomCode: ROOM_CODE, nickname: 'Tica', playerId: PLAYER_ID } });
  });

  it('answer sends the current question index once', () => {
    savePlayerSession(SESSION);
    const { result } = setup();
    act(() => {
      fake.receive(ServerEvents.QuestionStart, { ...QUESTION, index: 3 });
    });
    act(() => {
      result.current.answer(1);
    });
    act(() => {
      result.current.answer(2);
    });
    const answers = fake.emitted.filter((e) => e.event === 'player:answer');
    expect(answers).toEqual([{ event: 'player:answer', payload: { roomCode: ROOM_CODE, questionIndex: 3, optionIndex: 1 } }]);
    expect(result.current.state.selectedOption).toBe(1);
  });

  it('cannot answer after the reveal', () => {
    savePlayerSession(SESSION);
    const { result } = setup();
    act(() => {
      fake.receive(ServerEvents.QuestionStart, QUESTION);
      fake.receive(ServerEvents.QuestionReveal, REVEAL);
    });
    act(() => {
      result.current.answer(0);
    });
    expect(fake.emitted.some((e) => e.event === 'player:answer')).toBe(false);
  });

  it('cannot answer while waiting for the next question', () => {
    const { result } = setup();
    // Joins mid-question.
    act(() => {
      fake.receive(ServerEvents.QuestionStart, QUESTION);
      result.current.join(ROOM_CODE, 'Tica');
    });
    joined(true);
    act(() => {
      result.current.answer(0);
    });
    expect(fake.emitted.some((e) => e.event === 'player:answer')).toBe(false);
    // The next question lifts the wait.
    act(() => {
      fake.receive(ServerEvents.QuestionStart, { ...QUESTION, index: 1 });
    });
    act(() => {
      result.current.answer(0);
    });
    expect(fake.emitted.some((e) => e.event === 'player:answer')).toBe(true);
  });

  it('KICKED clears the stored session', () => {
    savePlayerSession(SESSION);
    const { result } = setup();
    act(() => {
      fake.receive(ServerEvents.Error, { code: 'KICKED', message: 'El presentador te sacó de la sala.' });
    });
    expect(localStorage.getItem(PLAYER_KEY)).toBeNull();
    expect(result.current.state.session).toBeNull();
    expect(result.current.state.error?.code).toBe('KICKED');
  });

  it('a validation error keeps the stored session', () => {
    savePlayerSession(SESSION);
    setup();
    act(() => {
      fake.receive(ServerEvents.Error, { code: 'RATE_LIMITED', message: 'Más despacio' });
    });
    expect(readPlayerSession()).toEqual(SESSION);
  });

  it('game:end clears the stored session', () => {
    savePlayerSession(SESSION);
    setup();
    act(() => {
      fake.receive(ServerEvents.GameEnd, { podium: [] });
    });
    expect(localStorage.getItem(PLAYER_KEY)).toBeNull();
  });
});

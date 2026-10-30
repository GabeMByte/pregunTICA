import { ServerEvents } from '@preguntica/shared';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HOST_TOKEN, ROOM_CODE, ROOM_STATE } from '../game/fixtures.js';
import { FakeSocket } from '../net/fake-socket.js';
import { HOST_KEY, readHostSession, saveHostSession } from '../net/storage.js';
import { useHostGame } from './useHostGame.js';

const SESSION = { roomCode: ROOM_CODE, hostToken: HOST_TOKEN };
let fake: FakeSocket;
const createSocket = () => fake.asGameSocket();

function setup() {
  return renderHook(() => useHostGame({ createSocket }));
}

beforeEach(() => {
  fake = new FakeSocket();
});

afterEach(() => {
  localStorage.clear();
});

describe('useHostGame', () => {
  it('connects on mount and disconnects on unmount', () => {
    const { result, unmount } = setup();
    expect(fake.connected).toBe(true);
    expect(result.current.state.connection).toBe('connected');
    unmount();
    expect(fake.connected).toBe(false);
    expect(fake.listenerCount(ServerEvents.RoomState)).toBe(0);
  });

  it('create emits host:create with the input', () => {
    const { result } = setup();
    act(() => {
      result.current.create({ topic: 'Volcanes', count: 5, difficulty: 'medium' });
    });
    expect(fake.emitted).toContainEqual({ event: 'host:create', payload: { topic: 'Volcanes', count: 5, difficulty: 'medium' } });
  });

  it('host:created saves the token in localStorage for reconnection', () => {
    const { result } = setup();
    act(() => {
      fake.receive(ServerEvents.HostCreated, SESSION);
    });
    expect(result.current.state.session).toEqual(SESSION);
    expect(readHostSession()).toEqual(SESSION);
  });

  it('with a stored session it sends host:rejoin on connect', () => {
    saveHostSession(SESSION);
    setup();
    expect(fake.emitted).toContainEqual({ event: 'host:rejoin', payload: SESSION });
  });

  it('sends host:rejoin again after the connection comes back', () => {
    saveHostSession(SESSION);
    const { result } = setup();
    act(() => {
      fake.disconnect();
    });
    expect(result.current.state.connection).toBe('disconnected');
    act(() => {
      fake.connect();
    });
    expect(fake.emitted.filter((e) => e.event === 'host:rejoin')).toHaveLength(2);
  });

  it('start, next and kick use the room code of the session', () => {
    saveHostSession(SESSION);
    const { result } = setup();
    act(() => {
      result.current.start();
      result.current.next();
      result.current.kick('Tica');
    });
    expect(fake.emitted).toContainEqual({ event: 'host:start', payload: { roomCode: ROOM_CODE } });
    expect(fake.emitted).toContainEqual({ event: 'host:next', payload: { roomCode: ROOM_CODE } });
    expect(fake.emitted).toContainEqual({ event: 'host:kick', payload: { roomCode: ROOM_CODE, nickname: 'Tica' } });
  });

  it('without a room, start/next/kick send nothing', () => {
    const { result } = setup();
    act(() => {
      result.current.start();
      result.current.next();
      result.current.kick('Tica');
    });
    expect(fake.emitted).toEqual([]);
  });

  it('server events update the state', () => {
    const { result } = setup();
    act(() => {
      fake.receive(ServerEvents.RoomState, ROOM_STATE);
    });
    expect(result.current.state.room).toEqual(ROOM_STATE);
  });

  it('an invalid payload never reaches the state', () => {
    const { result } = setup();
    act(() => {
      fake.receive(ServerEvents.RoomState, { ...ROOM_STATE, phase: 'HACKED' });
    });
    expect(result.current.state.room).toBeNull();
  });

  it('ROOM_NOT_FOUND clears the stored session', () => {
    saveHostSession(SESSION);
    const { result } = setup();
    act(() => {
      fake.receive(ServerEvents.Error, { code: 'ROOM_NOT_FOUND', message: 'No existe' });
    });
    expect(localStorage.getItem(HOST_KEY)).toBeNull();
    expect(result.current.state.session).toBeNull();
  });

  it('game:end clears the stored session', () => {
    saveHostSession(SESSION);
    setup();
    act(() => {
      fake.receive(ServerEvents.GameEnd, { podium: [{ rank: 1, nickname: 'Tica', score: 900 }] });
    });
    expect(localStorage.getItem(HOST_KEY)).toBeNull();
  });
});

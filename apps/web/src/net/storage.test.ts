import { afterEach, describe, expect, it } from 'vitest';
import {
  clearHostSession,
  clearPlayerSession,
  HOST_KEY,
  PLAYER_KEY,
  readHostSession,
  readPlayerSession,
  saveHostSession,
  savePlayerSession,
} from './storage.js';

const HOST = { roomCode: 'ABC234', hostToken: '6f1c8f5e-3b7a-4c2e-9d1f-2a4b6c8d0e1f' };
const PLAYER = { roomCode: 'ABC234', playerId: '0b9e4d2a-7c1f-4e3b-8a5d-1c2e3f4a5b6c', nickname: 'Tica' };

const blocked = (): Storage => {
  throw new DOMException('Blocked', 'SecurityError');
};

afterEach(() => {
  localStorage.clear();
});

describe('SPEC §4 Interfaz: session in localStorage for reconnection', () => {
  it('saves and reads back the host session', () => {
    saveHostSession(HOST);
    expect(readHostSession()).toEqual(HOST);
  });

  it('saves and reads back the player session', () => {
    savePlayerSession(PLAYER);
    expect(readPlayerSession()).toEqual(PLAYER);
  });

  it('host and player sessions are independent', () => {
    saveHostSession(HOST);
    savePlayerSession(PLAYER);
    clearHostSession();
    expect(readHostSession()).toBeNull();
    expect(readPlayerSession()).toEqual(PLAYER);
    clearPlayerSession();
    expect(readPlayerSession()).toBeNull();
  });

  it('returns null when there is no session', () => {
    expect(readHostSession()).toBeNull();
    expect(readPlayerSession()).toBeNull();
  });

  it('corrupt JSON is no session', () => {
    localStorage.setItem(HOST_KEY, '{not json');
    expect(readHostSession()).toBeNull();
  });

  it('data that fails the schema is no session', () => {
    localStorage.setItem(PLAYER_KEY, JSON.stringify({ ...PLAYER, playerId: 'not-a-uuid' }));
    expect(readPlayerSession()).toBeNull();
    localStorage.setItem(HOST_KEY, JSON.stringify({ ...HOST, extra: 1 }));
    expect(readHostSession()).toBeNull();
  });

  it('blocked storage never throws', () => {
    expect(readHostSession(blocked)).toBeNull();
    expect(() => {
      saveHostSession(HOST, blocked);
      clearHostSession(blocked);
      savePlayerSession(PLAYER, blocked);
      clearPlayerSession(blocked);
    }).not.toThrow();
    expect(readPlayerSession(blocked)).toBeNull();
  });
});

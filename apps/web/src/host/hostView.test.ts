import type { Phase } from '@preguntica/shared';
import { describe, expect, it } from 'vitest';
import { HOST_TOKEN, QUESTION, REVEAL, ROOM_CODE, ROOM_STATE } from '../game/fixtures.js';
import { initialHostState, type HostState } from './hostReducer.js';
import { canStart, selectHostScreen, showsFallbackNotice } from './hostView.js';

const SESSION = { roomCode: ROOM_CODE, hostToken: HOST_TOKEN };
const TOP = [{ nickname: 'Tica', score: 900, delta: 900 }];
const PODIUM = [{ rank: 1, nickname: 'Tica', score: 900 }];

function inRoom(phase: Phase, overrides: Partial<HostState> = {}): HostState {
  return {
    ...initialHostState(SESSION),
    connection: 'connected',
    room: { ...ROOM_STATE, phase, questionIndex: phase === 'LOBBY' || phase === 'GENERATING' ? null : 0 },
    ...overrides,
  };
}

const screenOf = (state: HostState) => selectHostScreen(state).name;

describe('selectHostScreen', () => {
  it('without a session shows the form, even while connecting', () => {
    expect(screenOf(initialHostState(null))).toBe('form');
  });

  it('with a session but no room yet is recovering it', () => {
    expect(screenOf(initialHostState(SESSION))).toBe('recovering');
  });

  it.each(['GENERATING', 'LOBBY'] as const)('%s uses the lobby: players can join while questions generate', (phase) => {
    expect(screenOf(inRoom(phase))).toBe('lobby');
  });

  it('picks the screen by phase, not by which payloads are around', () => {
    expect(screenOf(inRoom('QUESTION', { question: QUESTION }))).toBe('question');
    expect(screenOf(inRoom('REVEAL', { question: QUESTION, reveal: REVEAL }))).toBe('reveal');
    expect(screenOf(inRoom('LEADERBOARD', { reveal: REVEAL, leaderboard: TOP }))).toBe('leaderboard');
  });

  it('REVEAL does not need question:start: a host back from a reload only has the reveal', () => {
    expect(screenOf(inRoom('REVEAL', { question: null, reveal: REVEAL }))).toBe('reveal');
  });

  it('room:state arrives first: waits instead of drawing the previous question', () => {
    const state = inRoom('QUESTION', { question: QUESTION });
    const next: HostState = { ...state, room: { ...ROOM_STATE, phase: 'QUESTION', questionIndex: 1 } };
    expect(screenOf(next)).toBe('waiting');
  });

  it.each(['REVEAL', 'LEADERBOARD', 'PODIUM'] as const)('waits in %s until its payload arrives', (phase) => {
    expect(screenOf(inRoom(phase))).toBe('waiting');
  });

  it('the podium stays on screen after game:end ended the session', () => {
    expect(screenOf(inRoom('PODIUM', { session: null, podium: PODIUM }))).toBe('podium');
  });
});

describe('canStart', () => {
  it('needs the lobby, a connected player and a connection', () => {
    expect(canStart(inRoom('LOBBY'))).toBe(true);
    expect(canStart(inRoom('GENERATING'))).toBe(false);
    expect(canStart(inRoom('QUESTION'))).toBe(false);
    expect(canStart(inRoom('LOBBY', { connection: 'disconnected' }))).toBe(false);
  });

  it('a room with only disconnected players cannot start', () => {
    const room = { ...ROOM_STATE, players: [{ nickname: 'Tica', score: 0, connected: false }] };
    expect(canStart(inRoom('LOBBY', { room }))).toBe(false);
  });
});

describe('showsFallbackNotice', () => {
  const withOrigin = (phase: Phase, questionOrigin: 'ai' | 'fallback' | null) => {
    const state = inRoom(phase);
    return state.room === null ? null : { ...state.room, questionOrigin };
  };

  it.each(['GENERATING', 'LOBBY'] as const)('shows in %s with fallback questions', (phase) => {
    expect(showsFallbackNotice(withOrigin(phase, 'fallback'))).toBe(true);
  });

  it.each(['QUESTION', 'REVEAL', 'LEADERBOARD', 'PODIUM'] as const)('never shows in %s: players are looking at the projector', (phase) => {
    expect(showsFallbackNotice(withOrigin(phase, 'fallback'))).toBe(false);
  });

  it('does not show with AI questions or before knowing the origin', () => {
    expect(showsFallbackNotice(withOrigin('LOBBY', 'ai'))).toBe(false);
    expect(showsFallbackNotice(withOrigin('GENERATING', null))).toBe(false);
    expect(showsFallbackNotice(null)).toBe(false);
  });
});

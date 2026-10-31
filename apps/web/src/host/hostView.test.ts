import { QUESTION_TIME_MS, type Phase } from '@preguntica/shared';
import { describe, expect, it } from 'vitest';
import { HOST_TOKEN, QUESTION, REVEAL, ROOM_CODE, ROOM_STATE } from '../game/fixtures.js';
import { initialHostState, type HostState } from './hostReducer.js';
import {
  canStart,
  EMPTY_DRAFT,
  formDraft,
  joinUrl,
  localEndsAt,
  rankShifts,
  selectHostScreen,
  showsFallbackNotice,
  updateDraft,
} from './hostView.js';

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

describe('localEndsAt', () => {
  const NOW = 1_000_000;

  it('keeps the server time when the clocks agree, as after a rejoin mid-question', () => {
    expect(localEndsAt(NOW + 12_000, NOW)).toBe(NOW + 12_000);
  });

  it('never gives a question more time than its limit, with a local clock running behind', () => {
    expect(localEndsAt(NOW + 3_600_000, NOW)).toBe(NOW + QUESTION_TIME_MS);
  });
});

describe('rankShifts', () => {
  it('is all zeros when nobody moved', () => {
    expect(
      rankShifts([
        { nickname: 'Ana', score: 900, delta: 100 },
        { nickname: 'Beto', score: 500, delta: 0 },
      ]),
    ).toEqual([0, 0]);
  });

  it('says how many places each entry climbed or fell', () => {
    // Before this question: Beto 800, Cata 600, Ana 100.
    const entries = [
      { nickname: 'Ana', score: 1100, delta: 1000 },
      { nickname: 'Beto', score: 800, delta: 0 },
      { nickname: 'Cata', score: 700, delta: 100 },
    ];
    expect(rankShifts(entries)).toEqual([2, -1, -1]);
  });

  it('keeps the current order on a tie, so nobody moves for no reason', () => {
    const entries = [
      { nickname: 'Ana', score: 500, delta: 0 },
      { nickname: 'Beto', score: 500, delta: 0 },
    ];
    expect(rankShifts(entries)).toEqual([0, 0]);
  });
});

describe('joinUrl', () => {
  it('points to the player route with the code in it (SPEC §4)', () => {
    expect(joinUrl('https://preguntica.example', ROOM_CODE)).toBe(`https://preguntica.example/play/${ROOM_CODE}`);
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

describe('question language in the draft', () => {
  it('starts as the interface language', () => {
    expect(formDraft(EMPTY_DRAFT, 'en').language).toBe('en');
    expect(formDraft(EMPTY_DRAFT, 'es').language).toBe('es');
  });

  it('keeps following the interface while the host edits other fields', () => {
    const typed = updateDraft(EMPTY_DRAFT, { ...formDraft(EMPTY_DRAFT, 'en'), topic: 'Volcanes' }, 'en');
    expect(typed.topic).toBe('Volcanes');
    expect(formDraft(typed, 'es').language).toBe('es');
  });

  it('a language picked by hand stays, whatever the interface', () => {
    const picked = updateDraft(EMPTY_DRAFT, { ...formDraft(EMPTY_DRAFT, 'en'), language: 'es' }, 'en');
    expect(formDraft(picked, 'en').language).toBe('es');
  });
});

import { describe, expect, it } from 'vitest';
import { QUESTION_TIME_MS, serverPayloadSchemas } from '@preguntica/shared';
import type { GameState } from '../engine/index.js';
import { NOW, makePlayer, makeQuestions, makeState, playerId } from '../engine/test-helpers.js';
import { eventsForTransition, snapshotFor, type Emission, type Message } from './transitions.js';

const T = QUESTION_TIME_MS;
const RESULT = { correct: true, points: 1000, streak: 1, totalScore: 1000 };

function at(phase: GameState['phase'], overrides: Partial<GameState> = {}): GameState {
  const started = phase !== 'GENERATING' && phase !== 'LOBBY';
  return makeState({
    phase,
    questions: makeQuestions(5),
    players: [makePlayer(1), makePlayer(2)],
    questionIndex: started ? 1 : null,
    questionStartedAt: started ? NOW : null,
    questionEndsAt: started ? NOW + T : null,
    ...overrides,
  });
}

/** Every payload must pass its strict shared schema (CLAUDE.md rule #2: no leaks). */
function validate(messages: readonly Message[]): void {
  for (const { event, payload } of messages) serverPayloadSchemas[event].parse(payload);
}

const events = (messages: readonly Message[]) => messages.map((m) => m.event);
const targets = (emissions: readonly Emission[], event: string) => emissions.filter((e) => e.event === event).map((e) => e.to);

describe('eventsForTransition', () => {
  it('always sends the public room state to the room', () => {
    const emissions = eventsForTransition(at('LOBBY'), at('LOBBY', { players: [makePlayer(1), makePlayer(2), makePlayer(3)] }));
    validate(emissions);
    expect(emissions).toEqual([expect.objectContaining({ to: { kind: 'room' }, event: 'room:state' })]);
  });

  it('LOBBY → QUESTION broadcasts the question without the answer', () => {
    const emissions = eventsForTransition(at('LOBBY'), at('QUESTION'));
    validate(emissions);
    expect(events(emissions)).toEqual(['room:state', 'question:start']);
    expect(targets(emissions, 'question:start')).toEqual([{ kind: 'room' }]);
    expect(JSON.stringify(emissions)).not.toContain('correctIndex');
  });

  it('LEADERBOARD → QUESTION broadcasts the next question', () => {
    const emissions = eventsForTransition(at('LEADERBOARD', { questionIndex: 0 }), at('QUESTION', { questionIndex: 1 }));
    expect(events(emissions)).toEqual(['room:state', 'question:start']);
  });

  it('an answer inside QUESTION only refreshes the room state', () => {
    const answered = at('QUESTION', { answers: { [playerId(1)]: { optionIndex: 0, elapsedMs: 10 } } });
    expect(events(eventsForTransition(at('QUESTION'), answered))).toEqual(['room:state']);
  });

  it('QUESTION → REVEAL sends one copy per player with its own result and one to the host without results', () => {
    const next = at('REVEAL', {
      players: [makePlayer(1, { lastResult: RESULT, score: 1000 }), makePlayer(2, { lastResult: { ...RESULT, correct: false, points: 0, totalScore: 0, streak: 0 } })],
    });
    const emissions = eventsForTransition(at('QUESTION'), next);
    validate(emissions);
    const reveals = emissions.filter((e) => e.event === 'question:reveal');
    expect(reveals.map((e) => e.to)).toEqual([{ kind: 'host' }, { kind: 'player', playerId: playerId(1) }, { kind: 'player', playerId: playerId(2) }]);
    const [toHost, toFirst] = reveals;
    expect(toHost?.payload).not.toHaveProperty('yourResult');
    expect(toFirst?.payload).toMatchObject({ yourResult: RESULT });
    expect(targets(emissions, 'question:reveal')).not.toContainEqual({ kind: 'room' });
  });

  it('REVEAL → LEADERBOARD broadcasts the leaderboard', () => {
    const emissions = eventsForTransition(at('REVEAL'), at('LEADERBOARD'));
    validate(emissions);
    expect(events(emissions)).toEqual(['room:state', 'leaderboard']);
  });

  it('LEADERBOARD → PODIUM broadcasts the podium', () => {
    const emissions = eventsForTransition(at('LEADERBOARD'), at('PODIUM'));
    validate(emissions);
    expect(events(emissions)).toEqual(['room:state', 'game:end']);
  });

  it('never includes player ids in room broadcasts', () => {
    const emissions = eventsForTransition(at('REVEAL'), at('LEADERBOARD'));
    const broadcasts = emissions.filter((e) => e.to.kind === 'room');
    expect(JSON.stringify(broadcasts.map((e) => e.payload))).not.toContain(playerId(1));
  });
});

describe('snapshotFor (join and reconnection)', () => {
  const lateJoiner = makePlayer(3, { eligibleFrom: 2 });

  it('SPEC §3: a late joiner during QUESTION is told to wait and does not get the question in progress', () => {
    const state = at('QUESTION', { players: [makePlayer(1), lateJoiner] });
    const messages = snapshotFor(state, { role: 'player', playerId: playerId(3) });
    validate(messages);
    expect(events(messages)).toEqual(['player:joined', 'room:state']);
    expect(messages[0]).toEqual({
      event: 'player:joined',
      payload: { playerId: playerId(3), nickname: lateJoiner.nickname, waitingForNextQuestion: true },
    });
  });

  it('an eligible player in the same QUESTION gets the question and is not waiting', () => {
    const state = at('QUESTION', { players: [makePlayer(1), lateJoiner] });
    const messages = snapshotFor(state, { role: 'player', playerId: playerId(1) });
    validate(messages);
    expect(events(messages)).toEqual(['player:joined', 'room:state', 'question:start']);
    expect(messages[0]?.payload).toMatchObject({ waitingForNextQuestion: false });
  });

  it('a late joiner is no longer waiting once its first question starts', () => {
    const state = at('QUESTION', { questionIndex: 2, players: [makePlayer(1), lateJoiner] });
    const messages = snapshotFor(state, { role: 'player', playerId: playerId(3) });
    expect(events(messages)).toEqual(['player:joined', 'room:state', 'question:start']);
    expect(messages[0]?.payload).toMatchObject({ waitingForNextQuestion: false });
  });

  it('the host gets the question but no player:joined', () => {
    const messages = snapshotFor(at('QUESTION'), { role: 'host' });
    validate(messages);
    expect(events(messages)).toEqual(['room:state', 'question:start']);
  });

  it('in REVEAL a player gets its own result and the host none', () => {
    const state = at('REVEAL', { players: [makePlayer(1, { lastResult: RESULT, score: 1000 })] });
    const forPlayer = snapshotFor(state, { role: 'player', playerId: playerId(1) });
    const forHost = snapshotFor(state, { role: 'host' });
    validate([...forPlayer, ...forHost]);
    expect(forPlayer.at(-1)).toMatchObject({ event: 'question:reveal', payload: { yourResult: RESULT } });
    expect(forHost.at(-1)?.event).toBe('question:reveal');
    expect(forHost.at(-1)?.payload).not.toHaveProperty('yourResult');
  });

  it.each([
    ['GENERATING', ['room:state']],
    ['LOBBY', ['room:state']],
    ['LEADERBOARD', ['room:state', 'leaderboard']],
    ['PODIUM', ['room:state', 'game:end']],
  ] as const)('in %s the host gets %j', (phase, expected) => {
    const messages = snapshotFor(at(phase), { role: 'host' });
    validate(messages);
    expect(events(messages)).toEqual(expected);
  });

  it('an unknown player id gets only the public state', () => {
    expect(events(snapshotFor(at('LOBBY'), { role: 'player', playerId: playerId(99) }))).toEqual(['room:state']);
  });
});

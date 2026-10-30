import { describe, expect, it } from 'vitest';
import {
  ClientEvents,
  ErrorPayloadSchema,
  clientPayloadSchemas,
  HostCreatedPayloadSchema,
  HostCreatePayloadSchema,
  HostRejoinPayloadSchema,
  PlayerAnswerPayloadSchema,
  PlayerJoinedPayloadSchema,
  PlayerJoinPayloadSchema,
  QuestionRevealPayloadSchema,
  QuestionStartPayloadSchema,
  RoomStatePayloadSchema,
  ServerEvents,
  serverPayloadSchemas,
} from './events.js';

const PLAYER_ID = '3f1c2a5e-8b4d-4e6f-9a1b-2c3d4e5f6a7b';

describe('event names', () => {
  it('match the spec (section 5)', () => {
    expect(Object.values(ClientEvents).sort()).toEqual(
      ['host:create', 'host:next', 'host:rejoin', 'host:start', 'player:answer', 'player:join'],
    );
    expect(Object.values(ServerEvents).sort()).toEqual(
      ['error', 'game:end', 'host:created', 'leaderboard', 'player:joined', 'question:reveal', 'question:start', 'room:state'],
    );
  });

  it('have a payload schema for every event', () => {
    expect(Object.keys(clientPayloadSchemas).sort()).toEqual(Object.values(ClientEvents).sort());
    expect(Object.keys(serverPayloadSchemas).sort()).toEqual(Object.values(ServerEvents).sort());
  });
});

const HOST_TOKEN = '9b2e4c1a-7d3f-4a8b-b6c5-1e2f3a4b5c6d';

describe('host:rejoin', () => {
  it('accepts a room code and a UUID host token', () => {
    expect(HostRejoinPayloadSchema.parse({ roomCode: 'abc234', hostToken: HOST_TOKEN })).toEqual({
      roomCode: 'ABC234',
      hostToken: HOST_TOKEN,
    });
  });

  it.each(['', 'not-a-uuid', PLAYER_ID.slice(0, -1)])('rejects host token %j', (hostToken) => {
    expect(HostRejoinPayloadSchema.safeParse({ roomCode: 'ABC234', hostToken }).success).toBe(false);
  });

  it('rejects a missing token and unknown keys', () => {
    expect(HostRejoinPayloadSchema.safeParse({ roomCode: 'ABC234' }).success).toBe(false);
    expect(HostRejoinPayloadSchema.safeParse({ roomCode: 'ABC234', hostToken: HOST_TOKEN, admin: true }).success).toBe(false);
  });
});

describe('host:created (sent only to the host)', () => {
  it('carries the room code and the host token', () => {
    expect(HostCreatedPayloadSchema.safeParse({ roomCode: 'ABC234', hostToken: HOST_TOKEN }).success).toBe(true);
  });

  it('rejects unknown keys', () => {
    expect(HostCreatedPayloadSchema.safeParse({ roomCode: 'ABC234', hostToken: HOST_TOKEN, extra: 1 }).success).toBe(false);
  });
});

describe('player:joined (sent only to that player)', () => {
  it('carries the player id, the stored nickname and the waiting flag', () => {
    const payload = { playerId: PLAYER_ID, nickname: 'Ana', waitingForNextQuestion: true };
    expect(PlayerJoinedPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('requires the waiting flag', () => {
    expect(PlayerJoinedPayloadSchema.safeParse({ playerId: PLAYER_ID, nickname: 'Ana' }).success).toBe(false);
  });

  it('rejects unknown keys (e.g. a leaked score of other players)', () => {
    expect(
      PlayerJoinedPayloadSchema.safeParse({ playerId: PLAYER_ID, nickname: 'Ana', waitingForNextQuestion: false, hostToken: HOST_TOKEN }).success,
    ).toBe(false);
  });
});

describe('host:create', () => {
  it('accepts a valid payload and trims the topic', () => {
    const parsed = HostCreatePayloadSchema.parse({ topic: '  Historia de Costa Rica ', count: 10, difficulty: 'medium' });
    expect(parsed.topic).toBe('Historia de Costa Rica');
  });

  it.each([4, 16, 7.5])('rejects count %s', (count) => {
    expect(HostCreatePayloadSchema.safeParse({ topic: 'Volcanes', count, difficulty: 'easy' }).success).toBe(false);
  });

  it('rejects an unknown difficulty', () => {
    expect(HostCreatePayloadSchema.safeParse({ topic: 'Volcanes', count: 5, difficulty: 'extreme' }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(
      HostCreatePayloadSchema.safeParse({ topic: 'Volcanes', count: 5, difficulty: 'easy', admin: true }).success,
    ).toBe(false);
  });

  it('SPEC §2: the question language defaults to Spanish', () => {
    expect(HostCreatePayloadSchema.parse({ topic: 'Volcanes', count: 5, difficulty: 'easy' }).language).toBe('es');
  });

  it.each(['es', 'en'] as const)('accepts language %s', (language) => {
    expect(HostCreatePayloadSchema.parse({ topic: 'Volcanes', count: 5, difficulty: 'easy', language }).language).toBe(language);
  });

  it('rejects any other language', () => {
    expect(HostCreatePayloadSchema.safeParse({ topic: 'Volcanes', count: 5, difficulty: 'easy', language: 'fr' }).success).toBe(false);
  });

  it('SPEC §6: normalizes the topic like nicknames before it reaches the prompt', () => {
    const parsed = HostCreatePayloadSchema.parse({ topic: 'Vol\u200Bcanes  de\n\u202ECosta Rica', count: 5, difficulty: 'easy' });
    expect(parsed.topic).toBe('Volcanes de Costa Rica');
  });

  it('rejects a topic that is too short once invisible characters are removed', () => {
    expect(HostCreatePayloadSchema.safeParse({ topic: 'A\u200B\u200B', count: 5, difficulty: 'easy' }).success).toBe(false);
  });
});

describe('player:join', () => {
  it('normalizes the room code to uppercase', () => {
    const parsed = PlayerJoinPayloadSchema.parse({ roomCode: ' abc234 ', nickname: 'Ana' });
    expect(parsed.roomCode).toBe('ABC234');
  });

  it('accepts an optional playerId', () => {
    expect(PlayerJoinPayloadSchema.safeParse({ roomCode: 'ABC234', nickname: 'Ana', playerId: PLAYER_ID }).success).toBe(true);
  });

  it.each(['ABC12', 'ABC2345', 'ABC0O1', 'ABC-23'])('rejects room code %s', (roomCode) => {
    expect(PlayerJoinPayloadSchema.safeParse({ roomCode, nickname: 'Ana' }).success).toBe(false);
  });

  it.each(['', '   ', 'x'.repeat(17)])('rejects nickname "%s"', (nickname) => {
    expect(PlayerJoinPayloadSchema.safeParse({ roomCode: 'ABC234', nickname }).success).toBe(false);
  });

  it('accepts a 16-character nickname', () => {
    expect(PlayerJoinPayloadSchema.safeParse({ roomCode: 'ABC234', nickname: 'x'.repeat(16) }).success).toBe(true);
  });

  it('rejects a playerId that is not a UUID', () => {
    expect(PlayerJoinPayloadSchema.safeParse({ roomCode: 'ABC234', nickname: 'Ana', playerId: 'abc' }).success).toBe(false);
  });
});

describe('player:answer', () => {
  it('accepts option indexes 0–3', () => {
    for (const optionIndex of [0, 1, 2, 3]) {
      expect(PlayerAnswerPayloadSchema.safeParse({ roomCode: 'ABC234', questionIndex: 0, optionIndex }).success).toBe(true);
    }
  });

  it.each([-1, 4, 1.5])('rejects option index %s', (optionIndex) => {
    expect(PlayerAnswerPayloadSchema.safeParse({ roomCode: 'ABC234', questionIndex: 0, optionIndex }).success).toBe(false);
  });

  it('rejects a negative question index', () => {
    expect(PlayerAnswerPayloadSchema.safeParse({ roomCode: 'ABC234', questionIndex: -1, optionIndex: 0 }).success).toBe(false);
  });
});

describe('question:start (CLAUDE.md rule #2)', () => {
  const payload = {
    index: 0,
    total: 5,
    prompt: '¿Cuál es el volcán más alto de Costa Rica?',
    options: ['Irazú', 'Poás', 'Arenal', 'Turrialba'],
    endsAt: 1_761_600_000_000,
  };

  it('accepts a payload without the answer', () => {
    expect(QuestionStartPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('rejects a payload that leaks correctIndex', () => {
    expect(QuestionStartPayloadSchema.safeParse({ ...payload, correctIndex: 0 }).success).toBe(false);
  });

  it('rejects a payload that leaks the explanation', () => {
    expect(QuestionStartPayloadSchema.safeParse({ ...payload, explanation: 'Mide 3432 m' }).success).toBe(false);
  });

  it('rejects duplicated options', () => {
    expect(QuestionStartPayloadSchema.safeParse({ ...payload, options: ['A', 'B', 'a', 'C'] }).success).toBe(false);
  });
});

describe('question:reveal', () => {
  it('requires one vote count per option', () => {
    const base = { correctIndex: 0, explanation: 'Mide 3432 m' };
    expect(QuestionRevealPayloadSchema.safeParse({ ...base, distribution: [3, 1, 0, 2] }).success).toBe(true);
    expect(QuestionRevealPayloadSchema.safeParse({ ...base, distribution: [3, 1, 0] }).success).toBe(false);
  });
});

describe('room:state', () => {
  const payload = {
    roomCode: 'ABC234',
    phase: 'LOBBY',
    topic: 'Volcanes',
    players: [{ nickname: 'Ana', score: 0, connected: true }],
    questionIndex: null,
    totalQuestions: 5,
    questionOrigin: 'ai',
  };

  it('accepts the public state', () => {
    expect(RoomStatePayloadSchema.safeParse(payload).success).toBe(true);
  });

  it.each(['ai', 'fallback', null])('SPEC §5: accepts questionOrigin %s', (questionOrigin) => {
    expect(RoomStatePayloadSchema.safeParse({ ...payload, questionOrigin }).success).toBe(true);
  });

  it('security review M2: questionOrigin is optional (only the host copy carries it)', () => {
    const { questionOrigin: _hostOnly, ...forPlayers } = payload;
    expect(RoomStatePayloadSchema.safeParse(forPlayers).success).toBe(true);
  });

  it('rejects unknown origins', () => {
    expect(RoomStatePayloadSchema.safeParse({ ...payload, questionOrigin: 'cache' }).success).toBe(false);
  });

  it('rejects players that expose their playerId', () => {
    const leaky = { ...payload, players: [{ nickname: 'Ana', score: 0, connected: true, playerId: PLAYER_ID }] };
    expect(RoomStatePayloadSchema.safeParse(leaky).success).toBe(false);
  });
});

describe('error codes', () => {
  it('SPEC §6: include TOPIC_REJECTED', () => {
    expect(ErrorPayloadSchema.safeParse({ code: 'TOPIC_REJECTED', message: 'Tema no permitido' }).success).toBe(true);
  });
});

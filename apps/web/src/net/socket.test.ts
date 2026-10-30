import { ServerEvents } from '@preguntica/shared';
import { describe, expect, it, vi } from 'vitest';
import { FakeSocket } from './fake-socket.js';
import { subscribe } from './socket.js';

const ROOM_STATE = {
  roomCode: 'ABC234',
  phase: 'LOBBY',
  players: [{ nickname: 'Tica', score: 0, connected: true }],
};

describe('CLAUDE.md rule 3: every server payload is validated with Zod', () => {
  it('passes a valid payload to the handler', () => {
    const fake = new FakeSocket();
    const handler = vi.fn();
    subscribe(fake.asGameSocket(), ServerEvents.Error, handler, vi.fn());
    fake.receive(ServerEvents.Error, { code: 'ROOM_NOT_FOUND', message: 'No existe' });
    expect(handler).toHaveBeenCalledWith({ code: 'ROOM_NOT_FOUND', message: 'No existe' });
  });

  it('drops an invalid payload and reports it as a protocol error', () => {
    const fake = new FakeSocket();
    const handler = vi.fn();
    const onProtocolError = vi.fn();
    subscribe(fake.asGameSocket(), ServerEvents.Error, handler, onProtocolError);
    fake.receive(ServerEvents.Error, { code: 'NOT_A_CODE', message: 1 });
    expect(handler).not.toHaveBeenCalled();
    expect(onProtocolError).toHaveBeenCalledWith(expect.objectContaining({ event: ServerEvents.Error }));
  });

  it('rejects unknown keys (strict schemas): a leaked correctIndex never reaches the state', () => {
    const fake = new FakeSocket();
    const handler = vi.fn();
    subscribe(fake.asGameSocket(), ServerEvents.QuestionStart, handler, vi.fn());
    fake.receive(ServerEvents.QuestionStart, {
      index: 0,
      total: 5,
      prompt: '¿Cuál es el volcán más alto de Costa Rica?',
      options: ['Irazú', 'Poás', 'Arenal', 'Turrialba'],
      endsAt: 1_761_600_020_000,
      correctIndex: 0,
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('a missing payload is a protocol error too', () => {
    const fake = new FakeSocket();
    const onProtocolError = vi.fn();
    subscribe(fake.asGameSocket(), ServerEvents.Leaderboard, vi.fn(), onProtocolError);
    fake.receive(ServerEvents.Leaderboard);
    expect(onProtocolError).toHaveBeenCalledOnce();
  });

  it('reports to the console by default', () => {
    const fake = new FakeSocket();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    subscribe(fake.asGameSocket(), ServerEvents.RoomState, vi.fn());
    fake.receive(ServerEvents.RoomState, { nope: true });
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it('the returned function stops listening', () => {
    const fake = new FakeSocket();
    const handler = vi.fn();
    const unsubscribe = subscribe(fake.asGameSocket(), ServerEvents.RoomState, handler, vi.fn());
    unsubscribe();
    fake.receive(ServerEvents.RoomState, ROOM_STATE);
    expect(handler).not.toHaveBeenCalled();
    expect(fake.listenerCount(ServerEvents.RoomState)).toBe(0);
  });
});

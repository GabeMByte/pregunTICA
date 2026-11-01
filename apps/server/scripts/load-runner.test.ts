import type { AddressInfo } from 'node:net';
import { MAX_PLAYERS } from '@preguntica/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, type App } from '../src/app.js';
import { loadExitCode } from './load-report.js';
import { runLoadTest, type LoadOptions } from './load-runner.js';

let app: App | undefined;

afterEach(async () => {
  await app?.io.close();
  app = undefined;
});

/** A server in this process with the local bank: no API, no network. */
async function start(): Promise<string> {
  app = createApp();
  const server = app.httpServer;
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return `http://localhost:${String((server.address() as AddressInfo).port)}`;
}

const options = (url: string, patch: Partial<LoadOptions> = {}): LoadOptions => ({
  url,
  topic: 'Volcanes de Costa Rica',
  players: MAX_PLAYERS,
  minDelayMs: 0,
  maxDelayMs: 30,
  timeoutMs: 30_000,
  random: Math.random,
  ...patch,
});

describe('pnpm load: a full game with bots', () => {
  it('50 bots join, play all 5 questions and every answer counts', async () => {
    const result = await runLoadTest(options(await start()));
    expect(result.errors).toEqual({});
    expect(result).toMatchObject({ joined: MAX_PLAYERS, finished: true, playersFinished: MAX_PLAYERS, missedStarts: 0, questionOrigin: 'fallback' });
    expect(result.joinMs).toHaveLength(MAX_PLAYERS);
    expect(result.startLatencyMs).toHaveLength(MAX_PLAYERS * 5);
    expect(result.answersSent).toEqual([50, 50, 50, 50, 50]);
    expect(result.answersCounted).toEqual([50, 50, 50, 50, 50]);
    expect(loadExitCode(result)).toBe(0);
  }, 30_000);

  it('the room is created like WARM_TOPICS warms it, so it hits the cache', async () => {
    const url = await start();
    const created: unknown[] = [];
    app?.io.on('connection', (socket) => {
      socket.on('host:create', (payload) => created.push(payload));
    });
    await runLoadTest(options(url, { players: 1 }));
    expect(created).toEqual([{ topic: 'Volcanes de Costa Rica', count: 5, difficulty: 'medium', language: 'es' }]);
  }, 30_000);

  it('a server that is not there is reported, not thrown', async () => {
    const result = await runLoadTest(options('http://localhost:1', { players: 2, timeoutMs: 5_000 }));
    expect(result.finished).toBe(false);
    expect(result.errors['host connect_error']).toBe(1);
    expect(loadExitCode(result)).toBe(1);
  });

  it('a topic the server rejects ends the run with the error', async () => {
    const result = await runLoadTest(options(await start(), { topic: 'x', players: 2 }));
    expect(result.finished).toBe(false);
    expect(result.errors['host INVALID_PAYLOAD']).toBe(1);
  });
});

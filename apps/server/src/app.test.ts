import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@preguntica/shared';
import { createApp, type App } from './app.js';

describe('createApp', () => {
  let app: App;
  let baseUrl: string;

  beforeEach(async () => {
    app = createApp();
    await new Promise<void>((resolve) => app.httpServer.listen(0, resolve));
    const { port } = app.httpServer.address() as AddressInfo;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    await app.io.close();
  });

  it('answers the health check', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('returns 404 for unknown routes', async () => {
    const res = await fetch(`${baseUrl}/nope`);
    expect(res.status).toBe(404);
  });

  it('accepts socket.io connections', async () => {
    const client: Socket<ServerToClientEvents, ClientToServerEvents> = connect(baseUrl, { transports: ['websocket'] });
    await new Promise<void>((resolve, reject) => {
      client.on('connect', resolve);
      client.on('connect_error', reject);
    });
    expect(client.connected).toBe(true);
    client.disconnect();
  });
});

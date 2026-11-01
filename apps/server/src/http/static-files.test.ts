import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as connect } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type App } from '../app.js';

const INDEX = '<!doctype html><title>PregunTICA</title>';
const SCRIPT = 'console.log("app");';
let root: string;
let app: App | undefined;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'preguntica-static-'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), INDEX);
  writeFileSync(join(root, 'assets', 'index-abc123.js'), SCRIPT);
  writeFileSync(join(root, 'favicon.svg'), '<svg/>');
  // Outside the static root: must never be served.
  writeFileSync(join(root, '..', 'preguntica-secret.txt'), 'secret');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(join(root, '..', 'preguntica-secret.txt'), { force: true });
});

afterEach(async () => {
  await app?.io.close();
  app = undefined;
});

async function start({ staticDir }: { staticDir: string | undefined } = { staticDir: root }): Promise<string> {
  app = createApp({ staticDir });
  const server = app.httpServer;
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return `http://localhost:${String((server.address() as AddressInfo).port)}`;
}

/** fetch normalizes `..` away; this sends the path exactly as written. */
function rawGet(baseUrl: string, path: string): Promise<{ status: number; body: string }> {
  const { port } = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    request({ host: 'localhost', port, path, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => (body += chunk.toString()));
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, body });
      });
    })
      .on('error', reject)
      .end();
  });
}

describe('SPEC §4 Despliegue: the web build from the same port', () => {
  it('serves index.html at the root, never cached', async () => {
    const res = await fetch(`${await start()}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(await res.text()).toBe(INDEX);
  });

  it('serves hashed assets with their type, cached for good', async () => {
    const res = await fetch(`${await start()}/assets/index-abc123.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await res.text()).toBe(SCRIPT);
  });

  it('serves other files at the root, revalidated', async () => {
    const res = await fetch(`${await start()}/favicon.svg`);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  it.each(['/host', '/play', '/play/ABC234', '/dev/componentes?x=1'])('a React route (%s) gets index.html', async (path) => {
    const res = await fetch(`${await start()}${path}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(INDEX);
  });

  it('a missing file with an extension is a 404, not the app', async () => {
    const res = await fetch(`${await start()}/assets/missing.js`);
    expect(res.status).toBe(404);
  });

  it.each(['/../preguntica-secret.txt', '/assets/../../preguntica-secret.txt', '/%2e%2e/preguntica-secret.txt', '/..%2fpreguntica-secret.txt'])(
    'never leaves the static folder (%s)',
    async (path) => {
      const res = await rawGet(await start(), path);
      expect(res.body).not.toContain('secret');
    },
  );

  it('a malformed path is a 404', async () => {
    const res = await rawGet(await start(), '/%E0%A4%A');
    expect(res.status).toBe(404);
  });

  it('HEAD answers the headers without a body', async () => {
    const res = await fetch(`${await start()}/`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await res.text()).toBe('');
  });

  it('other methods are a 404', async () => {
    const res = await fetch(`${await start()}/`, { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('the health check and Socket.io still work next to it', async () => {
    const baseUrl = await start();
    expect(await (await fetch(`${baseUrl}/health`)).json()).toEqual({ status: 'ok' });
    const client = connect(baseUrl, { transports: ['websocket'], forceNew: true });
    await new Promise<void>((resolve, reject) => {
      client.on('connect', resolve);
      client.on('connect_error', reject);
    });
    client.disconnect();
  });

  it('without a static folder (development) everything but /health is a 404, as before', async () => {
    const res = await fetch(`${await start({ staticDir: undefined })}/`);
    expect(res.status).toBe(404);
  });
});

import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';

const SHOT = fileURLToPath(new URL('../../docs/screenshots/en/readme-lobby-projector.png', import.meta.url));
const SERVER_URL = 'http://localhost:3300';
const NICKNAMES = ['Pura Vida', 'Mae Tuanis', 'La Chinita', 'Yo mero', 'Tico Rico'];

function join(roomCode: string, nickname: string): Promise<Socket> {
  const socket = io(SERVER_URL, { forceNew: true });
  return new Promise((resolve) => {
    socket.once('player:joined', () => {
      resolve(socket);
    });
    socket.on('connect', () => {
      socket.emit('player:join', { roomCode, nickname });
    });
  });
}

test('projector lobby with AI questions and five players (en)', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  const page = await context.newPage();

  await page.goto('/host');
  await page.getByLabel('Topic').fill('Volcanoes of Costa Rica');
  await page.getByRole('button', { name: 'Create room' }).click();
  const code = page.getByText(/^[A-Z2-9]{6}$/).first();
  await code.waitFor();
  const roomCode = (await code.textContent()) ?? '';

  const sockets = await Promise.all(NICKNAMES.map((nickname) => join(roomCode, nickname)));
  await expect(page.getByRole('heading', { name: `Players: ${String(NICKNAMES.length)}` })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start' })).toBeEnabled();
  await expect(page.getByText('Backup questions')).toHaveCount(0);

  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: SHOT });

  for (const socket of sockets) socket.disconnect();
  await context.close();
});

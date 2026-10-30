import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';

const OUT_DIR = fileURLToPath(new URL('../../docs/screenshots/host/', import.meta.url));
const SERVER_URL = 'http://localhost:3200';
const QUESTIONS = 5;

/**
 * The projector first; 1366×768 is what many classroom projectors really show. Stills use reduced
 * motion; 'motion' plays with the animations on and takes no pictures, to check they end up right.
 */
const VIEWPORTS = [
  { name: 'projector', width: 1920, height: 1080, reducedMotion: 'reduce' },
  { name: 'small-projector', width: 1366, height: 768, reducedMotion: 'reduce' },
  { name: 'phone', width: 375, height: 812, reducedMotion: 'reduce' },
  { name: 'motion', width: 1920, height: 1080, reducedMotion: 'no-preference' },
] as const;

const NICKNAMES = ['Pura Vida', 'Mae Tuanis', 'La Chinita', 'Yo mero', 'Tico Rico'];

mkdirSync(OUT_DIR, { recursive: true });

interface Bot {
  nickname: string;
  socket: Socket;
}

function connectBot(roomCode: string, nickname: string): Promise<Bot> {
  const socket = io(SERVER_URL, { forceNew: true });
  return new Promise((resolve) => {
    socket.once('player:joined', () => {
      resolve({ nickname, socket });
    });
    socket.on('connect', () => {
      socket.emit('player:join', { roomCode, nickname });
    });
  });
}

/** Different picks per question, so the ranking changes and the vote bars are not all alike. */
function answer(bots: readonly Bot[], roomCode: string, questionIndex: number): void {
  bots.forEach(({ socket }, index) => {
    socket.emit('player:answer', { roomCode, questionIndex, optionIndex: (index + questionIndex) % 4 });
  });
}

async function shot(page: Page, viewport: string, name: string): Promise<void> {
  if (viewport === 'motion') return;
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT_DIR}${name}-${viewport}.png`, fullPage: viewport === 'phone' });
}

/** A projector has no scrollbar: everything must fit on one screen. */
async function expectNoScroll(page: Page, viewport: string): Promise<void> {
  if (viewport === 'phone') return;
  const overflow = await page.evaluate(() => ({
    vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow).toEqual({ vertical: 0, horizontal: 0 });
}

async function createRoom(page: Page, viewport: string): Promise<string> {
  await page.goto('/host');
  await page.getByRole('heading', { name: 'Nueva partida' }).waitFor();
  await expect(page.getByRole('button', { name: 'Crear sala' })).toBeEnabled();
  await shot(page, viewport, '01-form');
  await expectNoScroll(page, viewport);
  await page.getByLabel('Tema').fill('Volcanes de Costa Rica');
  await page.getByRole('button', { name: 'Crear sala' }).click();
  const code = page.getByText(/^[A-Z2-9]{6}$/).first();
  await code.waitFor();
  return (await code.textContent()) ?? '';
}

for (const { name: viewport, width, height, reducedMotion } of VIEWPORTS) {
  test(`full game @ ${viewport}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion });

    const roomCode = await createRoom(page, viewport);
    await page.getByRole('button', { name: 'Iniciar' }).waitFor();
    await expect(page.getByText('Esperando jugadores…')).toBeVisible();
    await shot(page, viewport, '02-lobby-empty');
    await expectNoScroll(page, viewport);
    await expect(page.getByRole('button', { name: 'Iniciar' })).toBeDisabled();

    const bots = await Promise.all(NICKNAMES.map((nickname) => connectBot(roomCode, nickname)));
    await expect(page.getByRole('heading', { name: `Jugadores: ${String(bots.length)}` })).toBeVisible();
    await expect(page.getByText('Preguntas de respaldo')).toBeVisible();
    await shot(page, viewport, '03-lobby');
    await expectNoScroll(page, viewport);

    await page.getByRole('button', { name: 'Expulsar a Tico Rico' }).click();
    await page.getByRole('heading', { name: '¿Expulsar a Tico Rico?' }).waitFor();
    await shot(page, viewport, '04-kick');
    await page.keyboard.press('Space'); // Focus is on Cancelar: the keyboard must not start the game.
    await expect(page.getByRole('button', { name: 'Iniciar' })).toBeVisible();
    await page.getByRole('button', { name: 'Expulsar a Tico Rico' }).click();
    await page.getByRole('button', { name: 'Expulsar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Jugadores: 4' })).toBeVisible();
    const players = bots.slice(0, 4);

    await page.keyboard.press('Space');

    for (let index = 0; index < QUESTIONS; index += 1) {
      await page.getByText(`Pregunta ${String(index + 1)} de ${String(QUESTIONS)}`).waitFor();
      await page.getByText(/0 de 4 respondieron/).waitFor();
      await expect(page.getByText('Preguntas de respaldo')).toHaveCount(0);

      if (index === 0) {
        players[0]?.socket.emit('player:answer', { roomCode, questionIndex: 0, optionIndex: 0 });
        await page.getByText('1 de 4 respondió').waitFor();
        await shot(page, viewport, '05-question');
        await expectNoScroll(page, viewport);
        await page.reload();
        await page.getByText('1 de 4 respondió').waitFor();
      }

      answer(index === 0 ? players.slice(1) : players, roomCode, index);
      await page.getByRole('button', { name: /Siguiente/ }).waitFor();

      if (index === 1) {
        await shot(page, viewport, '06-reveal');
        await expectNoScroll(page, viewport);
        // The room waits here for the host: after a reload REVEAL must be complete.
        await page.reload();
        await page.getByRole('button', { name: /Siguiente/ }).waitFor();
        await expect(page.getByRole('group', { name: /\(Correcta\)/ })).toBeVisible();
        await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty();
        await shot(page, viewport, '07-reveal-after-reload');
      }

      await page.keyboard.press('Space');
      await page.getByRole('heading', { name: 'Ranking' }).waitFor();
      if (index === 2) {
        await shot(page, viewport, '08-leaderboard');
        await expectNoScroll(page, viewport);
        await page.reload();
        await page.getByRole('heading', { name: 'Ranking' }).waitFor();
      }
      await page.keyboard.press('Enter');
    }

    await page.getByRole('heading', { name: '¡Podio final!' }).waitFor();
    await expectNoScroll(page, viewport); // With motion on, this runs while the steps are rising.
    for (const rank of [1, 2, 3]) {
      await expect(page.getByRole('img', { name: `Puesto ${String(rank)}` })).toBeInViewport({ ratio: viewport === 'phone' ? 0.1 : 1 });
    }
    await shot(page, viewport, '09-podium');
    await expect(page.getByText('Preguntas de respaldo')).toHaveCount(0);

    for (const { socket } of bots) socket.disconnect();
  });
}

test('RATE_LIMITED shows a clear message and keeps the form', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/host');

  // Each game above used one of the 5 rooms the limit allows; fill whatever is left.
  await page.getByLabel('Tema').fill('Ríos de Costa Rica');
  const filler = io(SERVER_URL, { forceNew: true });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    filler.emit('host:create', { topic: 'Relleno', count: 5, difficulty: 'easy' });
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  filler.disconnect();

  await page.getByRole('button', { name: 'Crear sala' }).click();
  await page.getByRole('alert').filter({ hasText: 'demasiadas salas' }).waitFor();
  await expect(page.getByLabel('Tema')).toHaveValue('Ríos de Costa Rica');
  await shot(page, 'projector', '10-rate-limited');
});

test('a stored session of a room that no longer exists goes back to the form', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/host');
  await page.getByRole('button', { name: 'Crear sala' }).waitFor();
  await page.evaluate(() => {
    localStorage.setItem('preguntica:host', JSON.stringify({ roomCode: 'ABC234', hostToken: crypto.randomUUID() }));
  });
  await page.reload();
  await page.getByRole('alert').filter({ hasText: 'ya no existe' }).waitFor();
  await page.getByRole('heading', { name: 'Nueva partida' }).waitFor();
  await expect(page.evaluate(() => localStorage.getItem('preguntica:host'))).resolves.toBeNull();
});

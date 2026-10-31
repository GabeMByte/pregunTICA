import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';

const SHOTS = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));
const SERVER_URL = 'http://localhost:3200';
const QUESTIONS = 5;

/** What the script reads on the projector, per interface language (SPEC §4 Idioma). */
const TEXTS = {
  es: {
    locale: 'es-CR',
    dir: `${SHOTS}host/`,
    topic: 'Volcanes de Costa Rica',
    newGame: 'Nueva partida',
    topicLabel: 'Tema',
    create: 'Crear sala',
    start: 'Iniciar',
    waiting: 'Esperando jugadores…',
    players: (n: number) => `Jugadores: ${String(n)}`,
    fallback: 'Preguntas de respaldo',
    kick: (nickname: string) => `Expulsar a ${nickname}`,
    kickTitle: (nickname: string) => `¿Expulsar a ${nickname}?`,
    kickConfirm: 'Expulsar',
    progress: (n: number) => `Pregunta ${String(n)} de ${String(QUESTIONS)}`,
    noneAnswered: /0 de 4 respondieron/,
    oneAnswered: '1 de 4 respondió',
    next: /Siguiente/,
    correct: /\(Correcta\)/,
    leaderboard: 'Ranking',
    podium: '¡Podio final!',
    rank: (n: number) => `Puesto ${String(n)}`,
  },
  en: {
    locale: 'en-US',
    dir: `${SHOTS}en/host/`,
    topic: 'Volcanoes of Costa Rica',
    newGame: 'New game',
    topicLabel: 'Topic',
    create: 'Create room',
    start: 'Start',
    waiting: 'Waiting for players…',
    players: (n: number) => `Players: ${String(n)}`,
    fallback: 'Backup questions',
    kick: (nickname: string) => `Remove ${nickname}`,
    kickTitle: (nickname: string) => `Remove ${nickname}?`,
    kickConfirm: 'Remove',
    progress: (n: number) => `Question ${String(n)} of ${String(QUESTIONS)}`,
    noneAnswered: /0 of 4 answered/,
    oneAnswered: '1 of 4 answered',
    next: /Next/,
    correct: /\(Correct\)/,
    leaderboard: 'Leaderboard',
    podium: 'Final podium!',
    rank: (n: number) => `Place ${String(n)}`,
  },
} as const;
type Texts = (typeof TEXTS)[keyof typeof TEXTS];

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

/** English is checked at the two sizes of SPEC §4 Interfaz; the other two only change the layout. */
const RUNS = [
  ...VIEWPORTS.map((viewport) => ({ ...viewport, texts: TEXTS.es as Texts })),
  ...VIEWPORTS.filter(({ name }) => name === 'projector' || name === 'phone').map((viewport) => ({ ...viewport, texts: TEXTS.en as Texts })),
];

const NICKNAMES = ['Pura Vida', 'Mae Tuanis', 'La Chinita', 'Yo mero', 'Tico Rico'];

for (const { dir } of Object.values(TEXTS)) mkdirSync(dir, { recursive: true });

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

async function shot(page: Page, viewport: string, name: string, dir: string = TEXTS.es.dir): Promise<void> {
  if (viewport === 'motion') return;
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${dir}${name}-${viewport}.png`, fullPage: viewport === 'phone' });
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

async function createRoom(page: Page, viewport: string, texts: Texts): Promise<string> {
  await page.goto('/host');
  await page.getByRole('heading', { name: texts.newGame }).waitFor();
  await expect(page.getByRole('button', { name: texts.create })).toBeEnabled();
  await shot(page, viewport, '01-form', texts.dir);
  await expectNoScroll(page, viewport);
  await page.getByLabel(texts.topicLabel).fill(texts.topic);
  await page.getByRole('button', { name: texts.create }).click();
  const code = page.getByText(/^[A-Z2-9]{6}$/).first();
  await code.waitFor();
  return (await code.textContent()) ?? '';
}

RUNS.forEach(({ name: viewport, width, height, reducedMotion, texts: t }, run) => {
  test(`full game @ ${viewport} (${t.locale})`, async ({ browser }) => {
    // Its own address per game (TRUST_PROXY is on): the 5-room limit is left to the test below.
    const context = await browser.newContext({ locale: t.locale, extraHTTPHeaders: { 'X-Forwarded-For': `10.0.1.${String(run + 1)}` } });
    const page = await context.newPage();
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion });
    const snap = (name: string) => shot(page, viewport, name, t.dir);

    const roomCode = await createRoom(page, viewport, t);
    await page.getByRole('button', { name: t.start }).waitFor();
    await expect(page.getByText(t.waiting)).toBeVisible();
    await snap('02-lobby-empty');
    await expectNoScroll(page, viewport);
    await expect(page.getByRole('button', { name: t.start })).toBeDisabled();

    const bots = await Promise.all(NICKNAMES.map((nickname) => connectBot(roomCode, nickname)));
    await expect(page.getByRole('heading', { name: t.players(bots.length) })).toBeVisible();
    await expect(page.getByText(t.fallback)).toBeVisible();
    await snap('03-lobby');
    await expectNoScroll(page, viewport);

    await page.getByRole('button', { name: t.kick('Tico Rico') }).click();
    await page.getByRole('heading', { name: t.kickTitle('Tico Rico') }).waitFor();
    await snap('04-kick');
    await page.keyboard.press('Space'); // Focus is on Cancel: the keyboard must not start the game.
    await expect(page.getByRole('button', { name: t.start })).toBeVisible();
    await page.getByRole('button', { name: t.kick('Tico Rico') }).click();
    await page.getByRole('button', { name: t.kickConfirm, exact: true }).click();
    await expect(page.getByRole('heading', { name: t.players(4) })).toBeVisible();
    const players = bots.slice(0, 4);

    await page.keyboard.press('Space');

    for (let index = 0; index < QUESTIONS; index += 1) {
      await page.getByText(t.progress(index + 1)).waitFor();
      await page.getByText(t.noneAnswered).waitFor();
      await expect(page.getByText(t.fallback)).toHaveCount(0);

      if (index === 0) {
        players[0]?.socket.emit('player:answer', { roomCode, questionIndex: 0, optionIndex: 0 });
        await page.getByText(t.oneAnswered).waitFor();
        await snap('05-question');
        await expectNoScroll(page, viewport);
        await page.reload();
        await page.getByText(t.oneAnswered).waitFor();
      }

      answer(index === 0 ? players.slice(1) : players, roomCode, index);
      await page.getByRole('button', { name: t.next }).waitFor();

      if (index === 1) {
        await snap('06-reveal');
        await expectNoScroll(page, viewport);
        // The room waits here for the host: after a reload REVEAL must be complete.
        await page.reload();
        await page.getByRole('button', { name: t.next }).waitFor();
        await expect(page.getByRole('group', { name: t.correct })).toBeVisible();
        await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty();
        await snap('07-reveal-after-reload');
      }

      await page.keyboard.press('Space');
      await page.getByRole('heading', { name: t.leaderboard }).waitFor();
      if (index === 2) {
        await snap('08-leaderboard');
        await expectNoScroll(page, viewport);
        await page.reload();
        await page.getByRole('heading', { name: t.leaderboard }).waitFor();
      }
      await page.keyboard.press('Enter');
    }

    await page.getByRole('heading', { name: t.podium }).waitFor();
    await expectNoScroll(page, viewport); // With motion on, this runs while the steps are rising.
    for (const rank of [1, 2, 3]) {
      await expect(page.getByRole('img', { name: t.rank(rank) })).toBeInViewport({ ratio: viewport === 'phone' ? 0.1 : 1 });
    }
    await snap('09-podium');
    await expect(page.getByText(t.fallback)).toHaveCount(0);

    for (const { socket } of bots) socket.disconnect();
    await context.close();
  });
});

test('RATE_LIMITED shows a clear message and keeps the form', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/host');

  // The games above came from other addresses: this one fills its own 5 rooms.
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

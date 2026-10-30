import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';

const OUT_DIR = fileURLToPath(new URL('../../docs/screenshots/player/', import.meta.url));
const PHONE = { width: 375, height: 812 };
const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

mkdirSync(OUT_DIR, { recursive: true });

async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT_DIR}${name}.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${name} scrolls sideways`).toBeLessThanOrEqual(0);
}

async function phone(browser: Browser, path = '/play', prepare?: (page: Page) => Promise<void>) {
  const context = await browser.newContext({ viewport: PHONE, reducedMotion: 'reduce', hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await prepare?.(page);
  await page.goto(path);
  return page;
}

interface BrowserSocket {
  connect(): void;
  emit(event: string, payload: unknown): void;
  once(event: string, listener: (payload: { roomCode: string }) => void): void;
}

interface HostWindow {
  host: BrowserSocket;
  newSocket: () => BrowserSocket;
}

let hostCount = 0;

/** The host UI belongs to another worktree, so the host is a real socket opened from a blank page. */
class Host {
  private constructor(private readonly page: Page) {}

  static async create(browser: Browser): Promise<{ host: Host; roomCode: string }> {
    hostCount += 1;
    const context = await browser.newContext({ extraHTTPHeaders: { 'X-Forwarded-For': `10.0.0.${String(hostCount)}` } });
    const page = await context.newPage();
    await page.goto('/');
    const roomCode = await page.evaluate(async () => {
      // Served by Vite, so the e2e package needs no socket.io-client of its own.
      const SOCKET_MODULE = '/src/net/socket.ts';
      const { createGameSocket } = (await import(SOCKET_MODULE)) as { createGameSocket: () => BrowserSocket };
      const hostWindow = window as unknown as HostWindow;
      hostWindow.newSocket = createGameSocket;
      hostWindow.host = createGameSocket();
      const created = new Promise<string>((resolve, reject) => {
        hostWindow.host.once('host:created', ({ roomCode: code }) => {
          resolve(code);
        });
        hostWindow.host.once('error', () => {
          reject(new Error('host:create failed'));
        });
      });
      hostWindow.host.connect();
      hostWindow.host.emit('host:create', { topic: 'Volcanes de Costa Rica', count: 5, difficulty: 'easy', language: 'es' });
      return created;
    });
    return { host: new Host(page), roomCode };
  }

  async send(event: string, payload: unknown) {
    await this.page.evaluate(
      ([name, body]) => {
        (window as unknown as HostWindow).host.emit(name as string, body);
      },
      [event, payload],
    );
  }

  /** Real players on real sockets, up to the room limit. */
  async fillRoom(roomCode: string, count: number) {
    await this.page.evaluate(
      async ([code, total]) => {
        await Promise.all(
          Array.from({ length: total as number }, (_, i) => {
            const socket = (window as unknown as HostWindow).newSocket();
            const joined = new Promise<void>((resolve) => {
              socket.once('player:joined', () => {
                resolve();
              });
            });
            socket.connect();
            socket.emit('player:join', { roomCode: code, nickname: `Jugador ${String(i)}` });
            return joined;
          }),
        );
      },
      [roomCode, count],
    );
  }
}

async function join(page: Page, nickname: string) {
  await page.getByLabel('Tu apodo').fill(nickname);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Estás dentro' }).or(page.getByRole('alert'))).toBeVisible();
}

/** Questions take a moment to be ready: start retries until the phone shows the first one. */
async function startGame(host: Host, roomCode: string, target: Page) {
  await expect(async () => {
    await host.send('host:start', { roomCode });
    await expect(target.getByRole('timer')).toBeVisible({ timeout: 500 });
  }).toPass();
}

const option = (page: Page, letter: string) => page.getByRole('button', { name: new RegExp(`^Opción ${letter}:`) });
/** A different letter per phone, rotating each round, so the scores end up spread out. */
const answerAll = (pages: Page[], round: number) =>
  Promise.all(pages.map((page, i) => option(page, OPTION_LETTERS[(i + round) % OPTION_LETTERS.length] ?? 'A').click()));

/** From REVEAL through the leaderboard to the next phase. */
async function closeRound(host: Host, roomCode: string, target: Page) {
  await expect(target.getByText(/Vas en el puesto/)).toBeVisible();
  await host.send('host:next', { roomCode });
  await expect(target.getByRole('heading', { name: 'Tu posición' })).toBeVisible();
  await host.send('host:next', { roomCode });
}

async function phoneShowing(pages: Page[], title: string): Promise<Page> {
  const showing = async () => (await Promise.all(pages.map((page) => page.getByRole('heading', { name: title }).isVisible()))).indexOf(true);
  await expect.poll(showing).toBeGreaterThanOrEqual(0);
  const found = pages[await showing()];
  if (found === undefined) throw new Error(`No phone shows ${title}`);
  return found;
}

/** The longest texts the contract allows, written over the real question:start. */
function lengthenQuestion(frame: string): string {
  if (!frame.startsWith('42["question:start"')) return frame;
  const [event, question] = JSON.parse(frame.slice(2)) as [string, Record<string, unknown>];
  const prompt = '¿Cuál de estos volcanes de Costa Rica tuvo la erupción más reciente registrada y qué tan cerca estuvo del Valle Central?'.slice(0, 120);
  const options = [0, 1, 2, 3].map((i) => `${String(i)} Volcán Rincón de la Vieja, en la cordillera de Guanacaste, Parque`.slice(0, 60));
  return `42${JSON.stringify([event, { ...question, prompt, options }])}`;
}

test('join form and its errors', async ({ browser }) => {
  const page = await phone(browser);
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  await shot(page, 'join-empty');

  await page.getByLabel('Código de sala').fill('ZZZZZZ');
  await join(page, 'Tica');
  await expect(page.getByRole('alert')).toHaveText('No encontramos esa sala. Revisa el código.');
  await shot(page, 'join-room-not-found');

  const { roomCode } = await Host.create(browser);
  const first = await phone(browser, `/play/${roomCode}`);
  await expect(first.getByLabel('Código de sala')).toHaveValue(roomCode);
  await shot(first, 'join-prefilled');
  await join(first, 'Tica');
  await expect(first.getByRole('heading', { name: 'Estás dentro' })).toBeVisible();

  const second = await phone(browser, `/play/${roomCode}`);
  await join(second, 'tica');
  await expect(second.getByRole('alert')).toHaveText('Ese apodo ya está en uso en esta sala. Prueba con otro.');
  await shot(second, 'join-nickname-taken');
});

test('rate limited after ten attempts on one socket', async ({ browser }) => {
  const page = await phone(browser);
  await page.getByLabel('Código de sala').fill('ZZZZZZ');
  await page.getByLabel('Tu apodo').fill('Tica');
  for (let attempt = 0; attempt < 11; attempt += 1) {
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
  }
  await expect(page.getByRole('alert')).toHaveText('Demasiados intentos. Espera un minuto y vuelve a probar.');
  await shot(page, 'join-rate-limited');
});

test('a full room', async ({ browser }) => {
  const { host, roomCode } = await Host.create(browser);
  await host.fillRoom(roomCode, 50);
  const page = await phone(browser, `/play/${roomCode}`);
  await join(page, 'Tica');
  await expect(page.getByRole('alert')).toHaveText('La sala está llena: ya tiene 50 jugadores.');
  await shot(page, 'join-room-full');
});

test('kicked and lobby', async ({ browser }) => {
  const { host, roomCode } = await Host.create(browser);
  const page = await phone(browser, `/play/${roomCode}`);
  await join(page, 'Pura Vida');
  await expect(page.getByRole('heading', { name: 'Estás dentro' })).toBeVisible();
  await shot(page, 'lobby');

  await host.send('host:kick', { roomCode, nickname: 'Pura Vida' });
  await expect(page.getByRole('heading', { name: 'Te sacaron de la sala' })).toBeVisible();
  await shot(page, 'kicked');
});

test('reload in the lobby comes back as the same player', async ({ browser }) => {
  const { roomCode } = await Host.create(browser);
  const page = await phone(browser, `/play/${roomCode}`);
  await join(page, 'Tica');
  const stored = await page.evaluate(() => localStorage.getItem('preguntica:player'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Estás dentro' })).toBeVisible();
  await expect(page.getByText('Tica', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('preguntica:player'))).toBe(stored);
});

test('longest question still fits a phone', async ({ browser }) => {
  const { host, roomCode } = await Host.create(browser);
  const page = await phone(browser, `/play/${roomCode}`, (target) =>
    target.routeWebSocket(/socket\.io/, (socket) => {
      const server = socket.connectToServer();
      socket.onMessage((message) => {
        server.send(message);
      });
      server.onMessage((message) => {
        socket.send(typeof message === 'string' ? lengthenQuestion(message) : message);
      });
    }),
  );
  await join(page, 'Tica');
  await startGame(host, roomCode, page);
  await shot(page, 'question-long');
  const lastOption = await option(page, 'D').boundingBox();
  expect((lastOption?.y ?? 0) + (lastOption?.height ?? 0)).toBeLessThanOrEqual(PHONE.height);
});

test('a dropped connection comes back to the same question with the answer kept', async ({ browser }) => {
  const { host, roomCode } = await Host.create(browser);
  const other = await phone(browser, `/play/${roomCode}`);
  let blocked = false;
  const sockets: { close: () => Promise<void> }[] = [];
  const page = await phone(browser, `/play/${roomCode}`, async (target) => {
    await target.route(/socket\.io/, (route) => (blocked ? route.abort() : route.continue()));
    await target.routeWebSocket(/socket\.io/, async (socket) => {
      if (blocked) {
        await socket.close();
        return;
      }
      socket.connectToServer();
      sockets.push(socket);
    });
  });
  await join(other, 'Otro');
  await join(page, 'Tica');
  await startGame(host, roomCode, page);
  await option(page, 'B').click();
  await expect(page.getByRole('status')).toHaveText('Respuesta enviada');

  blocked = true;
  await Promise.all(sockets.map((socket) => socket.close()));
  await expect(page.getByRole('heading', { name: 'Se perdió la conexión' })).toBeVisible();
  await shot(page, 'reconnecting');

  blocked = false;
  await expect(page.getByRole('status')).toHaveText('Respuesta enviada', { timeout: 15_000 });
  await expect(option(page, 'B')).toBeDisabled();
});

test('a full game with four phones and a late joiner', async ({ browser }) => {
  const { host, roomCode } = await Host.create(browser);
  const players = ['Pura Vida', 'Mae Tuanis', 'La Chinita', 'Yo mero'];
  const phones = await Promise.all(players.map(() => phone(browser, `/play/${roomCode}`)));
  await Promise.all(phones.map((page, i) => join(page, players[i] ?? '')));
  const [first, ...rest] = phones;
  if (first === undefined) throw new Error('No phones');
  await startGame(host, roomCode, first);
  await shot(first, 'question');

  const late = await phone(browser, `/play/${roomCode}`);
  await join(late, 'Tarde');
  await expect(late.getByText('Espera a la siguiente pregunta')).toBeVisible();
  await shot(late, 'waiting');

  await option(first, 'A').click();
  await expect(first.getByRole('status')).toHaveText('Respuesta enviada');
  await expect(option(first, 'A')).toBeDisabled();
  await shot(first, 'answered');

  // One phone per option, so exactly one is right and the rest are wrong.
  await Promise.all(rest.map((page, i) => option(page, OPTION_LETTERS[i + 1] ?? 'A').click()));
  const right = await phoneShowing(phones, '¡Correcto!');
  const wrong = await phoneShowing(phones, 'Incorrecto');
  await shot(right, 'reveal-correct');
  await shot(wrong, 'reveal-wrong');

  // Reload in REVEAL: same player, same result, same position.
  await right.reload();
  await expect(right.getByRole('heading', { name: '¡Correcto!' })).toBeVisible();
  await expect(right.getByText(/Vas en el puesto/)).toHaveText('Vas en el puesto 1 de 5');

  await host.send('host:next', { roomCode });
  await expect(wrong.getByRole('heading', { name: 'Tu posición' })).toBeVisible();
  await shot(wrong, 'leaderboard');

  await host.send('host:next', { roomCode });
  await expect(late.getByText('Pregunta 2 de 5')).toBeVisible();

  // Reload in QUESTION: same player, back in the same question and able to answer.
  await first.reload();
  await expect(first.getByText('Pregunta 2 de 5')).toBeVisible();

  const everyone = [...phones, late];
  await answerAll(everyone, 2);
  await closeRound(host, roomCode, first);
  for (const round of [3, 4, 5]) {
    await expect(first.getByText(`Pregunta ${String(round)} de 5`)).toBeVisible();
    await answerAll(everyone, round);
    await closeRound(host, roomCode, first);
  }

  await shot(await phoneShowing(everyone, '¡Ganaste!'), 'podium-winner');
  await shot(await phoneShowing(everyone, 'Terminaste en'), 'podium');
});

test('reduced motion turns the screen animations off', async ({ browser }) => {
  const { roomCode } = await Host.create(browser);
  const page = await phone(browser, `/play/${roomCode}`);
  await join(page, 'Tica');
  const running = () => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length);

  await expect.poll(running).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(running).toBeGreaterThan(0);
});

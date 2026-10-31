import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * On `pnpm dev:lan` the phone opens http://192.168.x.x: not a secure context, so APIs such as
 * crypto.randomUUID and navigator.clipboard do not exist. Playwright runs on localhost (always
 * secure), so this removes them before any page script runs to play the same game a phone would.
 */
async function insecurePage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Reflect.deleteProperty(Crypto.prototype, 'randomUUID');
    Reflect.deleteProperty(Navigator.prototype, 'clipboard');
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  return page;
}

test('without secure-context APIs the host creates a room and a player joins it', async ({ browser }) => {
  const host = await insecurePage(browser);
  await host.goto('/host');
  expect(await host.evaluate(() => typeof crypto.randomUUID)).toBe('undefined');
  await expect(host.getByRole('button', { name: 'Crear sala' })).toBeEnabled();
  await host.getByLabel('Tema').fill('Volcanes de Costa Rica');
  await host.getByRole('button', { name: 'Crear sala' }).click();
  const code = host.getByText(/^[A-Z2-9]{6}$/).first();
  await code.waitFor();
  const roomCode = (await code.textContent()) ?? '';

  const player = await insecurePage(browser);
  await player.goto(`/play/${roomCode}`);
  expect(await player.evaluate(() => typeof crypto.randomUUID)).toBe('undefined');
  await player.getByLabel('Tu apodo').fill('Mae del Wi-Fi');
  await player.getByRole('button', { name: 'Entrar' }).click();
  await expect(player.getByRole('heading', { name: 'Estás dentro' })).toBeVisible();
  await expect(host.getByRole('heading', { name: 'Jugadores: 1' })).toBeVisible();
});

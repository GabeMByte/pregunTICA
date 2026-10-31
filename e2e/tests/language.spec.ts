import { expect, test } from '@playwright/test';

/** SPEC §4 Idioma: the browser's language picks the interface; the switch wins and is remembered. */
test.describe('a browser in English', () => {
  test.use({ locale: 'en-US' });

  test('gets the interface in English, with the question language preselected to match', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('link', { name: /Create a game/ })).toBeVisible();

    await page.goto('/host');
    await expect(page.getByRole('heading', { name: 'New game' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'English' })).toBeChecked();
  });

  test('the switch changes to Spanish, and the choice survives a reload', async ({ page }) => {
    await page.goto('/play');
    await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible();

    await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'ES' }).click();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');

    await page.reload();
    await expect(page.getByLabel('Tu apodo')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Idioma' }).getByRole('button', { name: 'ES' })).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('a browser in Spanish', () => {
  test.use({ locale: 'es-MX' });

  test('gets the interface in Spanish', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.getByRole('link', { name: /Crear partida/ })).toBeVisible();
  });
});

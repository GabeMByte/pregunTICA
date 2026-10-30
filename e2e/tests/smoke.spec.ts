import { expect, test } from '@playwright/test';

test('home offers creating or joining a game', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'PregunTICA' })).toBeVisible();
  await page.getByRole('link', { name: /Unirme/ }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByText('Ingresa el código de la sala para unirte.')).toBeVisible();
});

test('host view loads', async ({ page }) => {
  await page.goto('/host');
  await expect(page.getByText('Crea una sala y elige un tema.')).toBeVisible();
});

test('the QR link opens the player view with the code filled in', async ({ page }) => {
  await page.goto('/play/abc234');
  await expect(page.getByText('ABC234')).toBeVisible();
});

import { expect, test } from '@playwright/test';

test('player view loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'PregunTICA' })).toBeVisible();
  await expect(page.getByText('Ingresa el código de la sala para unirte.')).toBeVisible();
});

test('host view loads', async ({ page }) => {
  await page.goto('/host');
  await expect(page.getByText('Crea una sala y elige un tema.')).toBeVisible();
});

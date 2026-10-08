import { expect, test } from '@playwright/test';

test('root redirects into the application shell', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/kasir\/?$/);
  await expect(page.getByRole('banner').getByText('WarungKasir')).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
});

test('shell has no horizontal overflow', async ({ page }) => {
  await page.goto('/kasir');
  await expect(page.getByRole('main')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('web app manifest is served and linked', async ({ page, request }) => {
  await page.goto('/kasir');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');

  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ name: 'WarungKasir', display: 'standalone' });
});

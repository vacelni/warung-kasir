import { expect, test } from '@playwright/test';

test('root sends a visitor without a session to login', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'WarungKasir' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'MASUK' })).toBeVisible();
});

test('login page has no horizontal overflow', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'MASUK' })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('login controls meet the 48px touch target', async ({ page }) => {
  await page.goto('/login');

  for (const control of [
    page.getByLabel('Email'),
    page.getByLabel('Password', { exact: true }),
    page.getByRole('button', { name: 'MASUK' }),
    page.getByRole('button', { name: 'Tampilkan password' }),
  ]) {
    const box = await control.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(48);
  }
});

test('web app manifest is served and linked', async ({ page, request }) => {
  await page.goto('/login');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');

  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ name: 'WarungKasir', display: 'standalone' });

  // Android installability needs PNG icons at 192px and 512px.
  const sizes = manifest.icons.filter((icon: { type: string }) => icon.type === 'image/png').map((icon: { sizes: string }) => icon.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).ok()).toBe(true);
  }
});

import { expect, test, type Page } from '@playwright/test';

// Requires the local Supabase stack with the dev seed and .env.local (see docs/RUNBOOK.md).
// Seed store A: active Nasi Goreng 15.000, Mie Goreng 12.000, Ayam Goreng 18.000 (Makanan),
// Es Teh 5.000, Es Jeruk 7.000 (Minuman), Kerupuk 2.000 (Snack); Nasi Rames is inactive.
// Changes product status, so it runs in the serial "mutations" project, after every read-only spec
// has finished (see playwright.config.ts).

const PASSWORD = 'password123';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'MASUK' }).click();
  await expect(page).toHaveURL(/\/kasir$/);
}

const card = (page: Page, name: string) => page.getByRole('main').getByRole('button', { name: new RegExp(`^${name}`) });

test.describe('menu changes reach the cashier screen', () => {
  test('a deactivated product leaves the cashier menu and comes back when reactivated', async ({ page }) => {
    await login(page, 'owner.a@warungkasir.test');
    const sheet = page.getByRole('dialog');
    const setStatus = async (action: 'Nonaktifkan' | 'Aktifkan') => {
      await page.goto('/menu');
      await page.getByRole('button', { name: 'Aksi untuk Kerupuk' }).click();
      await sheet.getByRole('button', { name: action }).click();
      await expect(page.getByText(action === 'Nonaktifkan' ? 'Kerupuk dinonaktifkan.' : 'Kerupuk diaktifkan.')).toBeVisible();
    };

    try {
      await page.goto('/kasir');
      await expect(card(page, 'Kerupuk')).toBeVisible();
      await expect(page.getByRole('group', { name: 'Kategori menu' }).getByRole('button', { name: 'Snack' })).toBeVisible();

      await setStatus('Nonaktifkan');

      // Kerupuk is the only Snack: the product and its now-empty category tab both disappear.
      await page.goto('/kasir');
      await expect(card(page, 'Nasi Goreng')).toBeVisible();
      await expect(card(page, 'Kerupuk')).toHaveCount(0);
      await expect(page.getByRole('group', { name: 'Kategori menu' }).getByRole('button', { name: 'Snack' })).toHaveCount(0);
    } finally {
      await setStatus('Aktifkan');
    }

    await page.goto('/kasir');
    await expect(card(page, 'Kerupuk')).toBeVisible();
  });
});

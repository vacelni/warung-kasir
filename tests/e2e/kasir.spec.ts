import { expect, test, type Locator, type Page } from '@playwright/test';

// Requires the local Supabase stack with the dev seed and .env.local (see docs/RUNBOOK.md).
// Seed store A: active Nasi Goreng 15.000, Mie Goreng 12.000, Ayam Goreng 18.000 (Makanan),
// Es Teh 5.000, Es Jeruk 7.000 (Minuman), Kerupuk 2.000 (Snack); Nasi Rames is inactive.
// One sign-in per viewport project keeps this under the local Auth sign-in rate limit.

const PASSWORD = 'password123';
const CASHIER = 'kasir1.a@warungkasir.test';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'MASUK' }).click();
  await expect(page).toHaveURL(/\/kasir$/);
}

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function expectTouchTarget(locator: Locator, minHeight = 44) {
  const box = await locator.boundingBox();
  expect(box, 'control is visible').not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(minHeight);
  expect(box!.width).toBeGreaterThanOrEqual(44);
}

const card = (page: Page, name: string) => page.getByRole('main').getByRole('button', { name: new RegExp(`^${name}`) });

test('cashier builds an order: search, category, add, quantities, remove, empty — all local', async ({ page }) => {
  await login(page, CASHIER);

  // Active products of the own store only (no Nasi Rames, nothing from store B).
  await expect(card(page, 'Nasi Goreng')).toBeVisible();
  for (const name of ['Mie Goreng', 'Ayam Goreng', 'Es Teh', 'Es Jeruk', 'Kerupuk']) {
    await expect(card(page, name)).toBeVisible();
  }
  await expect(card(page, 'Nasi Rames')).toHaveCount(0);
  await expect(card(page, 'Soto Ayam')).toHaveCount(0);
  await expect(card(page, 'Nasi Goreng')).toContainText('Rp15.000');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  const tabs = page.getByRole('group', { name: 'Kategori menu' });
  await expect(tabs.getByRole('button')).toHaveText(['Semua', 'Makanan', 'Minuman', 'Snack']);
  for (const tab of await tabs.getByRole('button').all()) await expectTouchTarget(tab);
  await expectTouchTarget(page.getByRole('searchbox', { name: 'Cari menu' }), 48);
  await expectTouchTarget(card(page, 'Nasi Goreng'), 88);

  // Category and search narrow the grid.
  await tabs.getByRole('button', { name: 'Minuman' }).click();
  await expect(card(page, 'Es Teh')).toBeVisible();
  await expect(card(page, 'Nasi Goreng')).toHaveCount(0);
  await tabs.getByRole('button', { name: 'Semua' }).click();
  await page.getByRole('searchbox', { name: 'Cari menu' }).fill('goreng');
  await expect(card(page, 'Es Teh')).toHaveCount(0);
  await expect(card(page, 'Mie Goreng')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Cari menu' }).fill('sate');
  await expect(page.getByRole('heading', { name: 'Menu tidak ditemukan' })).toBeVisible();
  await page.getByRole('button', { name: 'TAMPILKAN SEMUA MENU' }).click();
  await expect(card(page, 'Es Teh')).toBeVisible();

  // From here on, nothing may reach the database.
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/rest/v1/') || request.url().includes('/auth/v1/')) apiRequests.push(request.url());
  });

  // Nasi Goreng ×2 + Es Teh ×2 = Rp40.000 (the golden path order).
  await card(page, 'Nasi Goreng').click();
  await card(page, 'Nasi Goreng').click();
  await card(page, 'Es Teh').click();
  await card(page, 'Es Teh').click();
  await expect(card(page, 'Nasi Goreng')).toContainText('2 di pesanan');

  const viewOrder = page.getByRole('link', { name: 'LIHAT PESANAN' });
  await expect(viewOrder).toBeVisible();
  await expect(page.getByText('4 item')).toBeVisible();
  await expect(page.getByRole('main').getByText('Rp40.000', { exact: true })).toBeVisible();
  await expectTouchTarget(viewOrder, 48);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // The docked summary sits directly above the bottom navigation and never covers it.
  const barBox = await viewOrder.boundingBox();
  const navBox = await page.getByRole('navigation', { name: 'Navigasi utama' }).boundingBox();
  expect(barBox!.y + barBox!.height).toBeLessThanOrEqual(navBox!.y);

  // The last product row can still be scrolled clear of the docked bar.
  await card(page, 'Kerupuk').scrollIntoViewIfNeeded();
  const kerupuk = await card(page, 'Kerupuk').boundingBox();
  const bar = await page.getByText('4 item').boundingBox();
  expect(kerupuk!.y + kerupuk!.height).toBeLessThanOrEqual(bar!.y);

  await viewOrder.click();
  await expect(page).toHaveURL(/\/kasir\/pesanan$/);
  await expect(page.getByRole('heading', { name: 'Pesanan', level: 1 })).toBeVisible();

  const main = page.getByRole('main');
  const lines = main.getByRole('listitem');
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0)).toContainText('Nasi Goreng');
  await expect(lines.nth(0)).toContainText('Rp15.000');
  await expect(lines.nth(0)).toContainText('Rp30.000');
  await expect(lines.nth(1)).toContainText('Rp10.000');
  await expect(main.getByText('Rp40.000', { exact: true })).toHaveCount(2); // Subtotal and Total rows
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  for (const name of ['Kurangi Nasi Goreng', 'Tambah Nasi Goreng', 'Hapus Nasi Goreng']) {
    await expectTouchTarget(main.getByRole('button', { name }), 48);
  }
  await expectTouchTarget(main.getByRole('button', { name: 'LANJUT BAYAR' }), 48);

  // Quantity: 2 → 3 → 2; never below 1.
  await main.getByRole('button', { name: 'Tambah Nasi Goreng' }).click();
  await expect(lines.nth(0)).toContainText('Rp45.000');
  await main.getByRole('button', { name: 'Kurangi Nasi Goreng' }).click();
  await main.getByRole('button', { name: 'Kurangi Nasi Goreng' }).click();
  await expect(main.getByRole('button', { name: 'Kurangi Nasi Goreng' })).toBeDisabled();
  await expect(lines.nth(0)).toContainText('Rp15.000');

  // The order survives going back to the menu and returning.
  await page.getByRole('link', { name: 'Kembali ke menu' }).click();
  await expect(card(page, 'Nasi Goreng')).toContainText('1 di pesanan');
  await page.getByRole('link', { name: 'LIHAT PESANAN' }).click();

  await main.getByRole('button', { name: 'Hapus Nasi Goreng' }).click();
  await expect(lines).toHaveCount(1);
  await expect(main.getByText('Rp10.000', { exact: true })).toHaveCount(2);

  await main.getByRole('button', { name: 'KOSONGKAN PESANAN' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'KOSONGKAN' }).click();
  await expect(page.getByRole('heading', { name: 'Keranjang masih kosong.' })).toBeVisible();
  await expectTouchTarget(page.getByRole('link', { name: 'PILIH MENU' }), 48);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  expect(apiRequests, 'cart operations must not call the database').toEqual([]);
});

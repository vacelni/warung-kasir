import { expect, test, type Locator, type Page } from './support/test';

// Requires the local Supabase stack with the dev seed and .env.local (see docs/RUNBOOK.md).
// Seed store A: categories Makanan, Minuman, Snack; Nasi Goreng 15.000 (active), Nasi Rames 13.000 (inactive).
// Products cannot be deleted (MVP), so the mutation flow leaves one inactive product behind;
// run `npx supabase db reset` to return to the seed.

const PASSWORD = 'password123';
const OWNER = 'owner.a@warungkasir.test';
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

async function expectTouchTarget(locator: Locator, minHeight = 48) {
  const box = await locator.boundingBox();
  expect(box, 'control is visible').not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(minHeight);
  expect(box!.width).toBeGreaterThanOrEqual(44);
}

const row = (page: Page, name: string) => page.getByRole('main').getByRole('listitem').filter({ hasText: name });
const sheet = (page: Page) => page.getByRole('dialog');

test('owner sees the menu and categories without overflow and with large touch targets', async ({ page }) => {
  await login(page, OWNER);

  await page.goto('/menu');
  await expect(page.getByRole('heading', { name: 'Menu', level: 1 })).toBeVisible();
  await expect(row(page, 'Nasi Goreng')).toContainText('Rp15.000');
  await expect(row(page, 'Nasi Goreng')).toContainText('Aktif');
  await expect(row(page, 'Nasi Rames')).toContainText('Nonaktif');
  await expect(row(page, 'Nasi Rames')).toContainText('Makanan');
  await expect(page.getByRole('main')).not.toContainText('Soto Ayam'); // store B
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await expectTouchTarget(page.getByRole('button', { name: /TAMBAH MENU/ }));
  await expectTouchTarget(page.getByRole('button', { name: 'Aksi untuk Nasi Goreng' }));

  // The form sheet fits the viewport and its controls are large.
  await page.getByRole('button', { name: /TAMBAH MENU/ }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Tambah menu' })).toBeVisible();
  for (const control of [
    sheet(page).getByLabel('Nama menu'),
    sheet(page).getByLabel('Kategori'),
    sheet(page).getByLabel('Harga (Rp)'),
    sheet(page).getByRole('button', { name: 'SIMPAN' }),
    sheet(page).getByRole('button', { name: 'BATAL' }),
  ]) {
    await expectTouchTarget(control);
  }
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await sheet(page).getByRole('button', { name: 'BATAL' }).click();
  await expect(sheet(page)).toHaveCount(0);

  await page.goto('/kategori');
  await expect(page.getByRole('heading', { name: 'Kategori', level: 1 })).toBeVisible();
  await expect(row(page, 'Makanan')).toContainText('menu');
  await expect(row(page, 'Minuman')).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await expectTouchTarget(page.getByRole('button', { name: /TAMBAH KATEGORI/ }));
  await expectTouchTarget(page.getByRole('button', { name: 'Aksi untuk Makanan' }));
});

test.describe('cashier', () => {
  test.skip(({ viewport }) => viewport?.width !== 360, 'authorization is checked once, on the 360px project');

  test('cannot open the menu or category management (AC-07)', async ({ page }) => {
    await login(page, CASHIER);

    for (const path of ['/menu', '/kategori']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible();
      await expect(page.getByRole('button', { name: /TAMBAH/ })).toHaveCount(0);
    }
  });
});

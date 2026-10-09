import { goTo, login } from './support/offline';
import { expect, test, type Page } from './support/test';

// TEST_PLAN G.14 "empty database": a store that has no business records at all (no categories,
// menu, sales or other staff) behaves correctly on every screen. The store is a fixture created for
// the run by tests/e2e/support/global-setup.ts (empty-store.sql); the dev seed is not touched.
//
//   Store C "Warung Kosong": owner.c@warungkasir.test (Pak Kosong), kasir.c@warungkasir.test (Wati)
//   Store D "Warung Sepi":   owner.d@warungkasir.test (Bu Sepi), not even a cashier
//
// Read-only. Runs on the 360px phone and the 1280px desktop only.

test.skip(
  ({ viewport }) => viewport?.width !== 360 && viewport?.width !== 1280,
  'empty-state behavior is checked on the 360px phone and the 1280px desktop only',
);

const OWNER_C = 'owner.c@warungkasir.test';
const CASHIER_C = 'kasir.c@warungkasir.test';
const OWNER_D = 'owner.d@warungkasir.test';

const main = (page: Page) => page.getByRole('main');
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** No leftover placeholder from a missing value anywhere on screen. */
async function expectNoBrokenValues(page: Page) {
  await expect(page.locator('body')).not.toContainText(/NaN|Infinity|undefined|null|\[object/);
}

test.describe('owner of an empty store', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, OWNER_C);
  });

  test('Kasir: says there is no menu and offers TAMBAH MENU', async ({ page }) => {
    await expect(main(page).getByRole('heading', { name: 'Belum ada menu' })).toBeVisible();
    await expect(main(page)).toContainText('Tambahkan menu terlebih dahulu agar transaksi dapat dilakukan.');
    // No product grid, no search, no cart bar for a sale that cannot start.
    await expect(main(page).getByRole('searchbox')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'LIHAT PESANAN' })).toHaveCount(0);
    await main(page).getByRole('link', { name: 'TAMBAH MENU' }).click();
    await expect(page).toHaveURL(/\/menu$/);
    await expectNoBrokenValues(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('Kasir: the order and payment pages of an empty cart do not crash', async ({ page }) => {
    await page.goto('/kasir/pesanan');
    await expect(main(page)).toContainText('Keranjang masih kosong.');
    await page.goto('/kasir/bayar');
    await expect(main(page)).not.toContainText(/NaN|undefined/);
    await expect(main(page).getByRole('button', { name: 'BAYAR' })).toHaveCount(0);
  });

  test('Riwayat: no sales for any date; search and date filter still work', async ({ page }) => {
    await goTo(page, 'Riwayat');
    await expect(main(page).getByRole('heading', { name: 'Belum ada transaksi' })).toBeVisible();

    await page.getByRole('combobox', { name: 'Filter tanggal' }).selectOption('all');
    await expect(main(page).getByRole('heading', { name: 'Belum ada transaksi' })).toBeVisible();
    await expect(main(page)).toContainText('Transaksi yang disimpan akan muncul di sini.');

    await page.getByRole('searchbox', { name: 'Cari kode transaksi' }).fill('abc');
    await expect(main(page).getByRole('heading', { name: 'Transaksi tidak ditemukan' })).toBeVisible();
    await main(page).getByRole('button', { name: 'HAPUS PENCARIAN' }).click();
    await expect(main(page).getByRole('heading', { name: 'Belum ada transaksi' })).toBeVisible();
    await expectNoBrokenValues(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('Riwayat detail: an unknown sale is "not found", not a crash', async ({ page }) => {
    await page.goto('/riwayat/detail?id=00000000-0000-4000-8000-000000000000');
    await expect(main(page).getByRole('heading', { name: 'Transaksi tidak ditemukan' })).toBeVisible();
    await page.goto('/riwayat/detail');
    await expect(main(page).getByRole('heading', { name: 'Transaksi tidak ditemukan' })).toBeVisible();
  });

  test('Laporan: every metric is zero for every period, the chart and best sellers show empty states', async ({ page }) => {
    await goTo(page, 'Laporan');
    await expect(page).toHaveURL(/\/laporan$/);

    const metric = (name: string) => main(page).getByRole('group', { name, exact: true });
    const periods = ['Hari Ini', '7 Hari', '30 Hari', 'Custom'];
    for (const period of periods) {
      await main(page).getByRole('button', { name: period, exact: true }).click();
      await expect(metric('Omzet')).toContainText('Rp0');
      await expect(metric('Transaksi')).toContainText(/^0/);
      await expect(metric('Item Terjual')).toContainText(/^0/);
      // Average transaction with no transactions is Rp0 (PRD §21), never NaN.
      await expect(metric('Rata-rata Transaksi')).toContainText('Rp0');
      await expect(main(page).getByText(/^Belum ada penjualan /)).toBeVisible();
      await expect(main(page).getByTestId('sales-chart')).toHaveCount(0);
      await expect(main(page).getByRole('heading', { name: 'Belum ada menu terjual' })).toBeVisible();
      await expectNoBrokenValues(page);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    }
  });

  test('Menu and Kategori: empty lists with a next step', async ({ page }) => {
    await goTo(page, 'Kategori');
    await expect(main(page).getByRole('heading', { name: 'Belum ada kategori' })).toBeVisible();
    await expect(main(page).getByRole('button', { name: /TAMBAH KATEGORI/ }).first()).toBeVisible();

    await goTo(page, 'Menu');
    // A menu item needs a category, so the page points to creating one first.
    await expect(main(page).getByRole('heading', { name: 'Belum ada kategori' })).toBeVisible();
    await expectNoBrokenValues(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('Karyawan: a store with one cashier lists her, and never the owner', async ({ page }) => {
    await goTo(page, 'Karyawan');
    await expect(main(page).getByRole('listitem')).toHaveCount(1);
    await expect(main(page).getByRole('listitem')).toContainText('Wati');
    await expect(main(page)).not.toContainText('Pak Kosong');
  });

  test('Pengaturan: a store with no address, phone or receipt note shows placeholders', async ({ page }) => {
    await goTo(page, 'Pengaturan');
    await expect(main(page).getByText('Warung Kosong')).toBeVisible();
    await expect(main(page).getByText('Belum diisi').first()).toBeVisible();
    await expectNoBrokenValues(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('Backup / Export: empty tables export as CSV files with their header row only', async ({ page }) => {
    await goTo(page, 'Backup / Export');

    const download = page.waitForEvent('download');
    await main(page).getByRole('button', { name: 'UNDUH CSV Export Transaksi' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.csv$/);
    const text = (await readStream(await file.createReadStream())).replace(/^﻿/, '');
    const lines = text.split(/\r?\n/).filter((line) => line !== '');
    expect(lines).toHaveLength(1); // header only
    expect(lines[0]).toContain('id');
    await expect(page.getByText(/diunduh \(0 baris\)/)).toBeVisible();
  });
});

test('Karyawan: a store without any cashier shows the empty state and TAMBAH KASIR', async ({ page }) => {
  await login(page, OWNER_D);
  await goTo(page, 'Karyawan');
  await expect(main(page).getByRole('heading', { name: 'Belum ada kasir' })).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'TAMBAH KASIR' }).first()).toBeVisible();
  await expectNoBrokenValues(page);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test.describe('cashier of an empty store', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, CASHIER_C);
  });

  test('Kasir: tells the cashier to ask the owner; no TAMBAH MENU action', async ({ page }) => {
    await expect(main(page).getByRole('heading', { name: 'Belum ada menu' })).toBeVisible();
    await expect(main(page)).toContainText('Hubungi Owner untuk menambahkan menu.');
    await expect(main(page).getByRole('link', { name: 'TAMBAH MENU' })).toHaveCount(0);
    await expectNoBrokenValues(page);
  });

  test('Riwayat: empty, and nothing from other stores', async ({ page }) => {
    await goTo(page, 'Riwayat');
    await page.getByRole('combobox', { name: 'Filter tanggal' }).selectOption('all');
    await expect(main(page).getByRole('heading', { name: 'Belum ada transaksi' })).toBeVisible();
    await expect(main(page).getByRole('link', { name: /^TRX-/ })).toHaveCount(0);
  });

  test('Lainnya: shows the name and "Semua tersinkron" with nothing on the device', async ({ page }) => {
    await goTo(page, 'Lainnya');
    await expect(main(page).getByText('Wati')).toBeVisible();
    await expect(main(page).getByRole('region', { name: 'Status sinkronisasi' }).getByRole('status')).toHaveText('Semua tersinkron');
  });
});

async function readStream(stream: NodeJS.ReadableStream | null): Promise<string> {
  if (!stream) throw new Error('the download has no content');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString('utf8');
}

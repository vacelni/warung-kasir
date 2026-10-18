import { CREATE_TRANSACTION, injectFault } from './support/faults';
import { layoutProblems } from './support/layout';
import { KASIR1, login, OWNER, putOutboxEntry, type Entry } from './support/offline';
import { randomUUID } from 'node:crypto';
import { expect, FAILED_REQUEST, test, type Page } from './support/test';

// TEST_PLAN G.12: every screen, at every required width, checked with real browser geometry for
// sideways overflow, clipped text and prices, controls too small to tap, controls covered by a
// fixed bar or sheet, and overlapping controls (see support/layout.ts). Runs once per viewport
// project: 360, 390 and 412px phones, and the 1280px desktop (also on Microsoft Edge and on the
// production build in out/).
//
// Requires the local Supabase stack with the dev seed. Read-only: the pending sale it opens lives
// only in this browser's outbox. The app would send it, so every test blocks create_transaction
// (the request is answered with a server error and never reaches the database).

const SEED_SALE = '3f9a2c4e-7b1d-4c2a-9e10-000000000001'; // Andi, 7 Oct, Rp40.000
const STORE_A = '5a000000-0000-4000-8000-000000000001';

const main = (page: Page) => page.getByRole('main');
const sheet = (page: Page) => page.getByRole('dialog');

/** Checks the screen as it is now and reports every problem under one label. */
async function audit(page: Page, label: string) {
  // The audit measures the settled screen; wait for fonts and any pending layout.
  await page.evaluate(() => document.fonts.ready);
  const problems = await layoutProblems(page);
  expect.soft(problems, `layout of ${label}`).toEqual([]);
}

async function openRoute(page: Page, path: string, ready: () => Promise<void>) {
  await page.goto(path);
  await ready();
}

/** A sale as checkout leaves it in the outbox, under a fresh UUID (so a rerun never meets an old sale). */
function localSale(cashierId: string, id: string): Entry {
  const createdAt = new Date();
  return {
    id,
    code: `TRX-${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(createdAt).replaceAll('-', '')}-${id.slice(0, 6).toUpperCase()}`,
    store_id: STORE_A,
    cashier_id: cashierId,
    created_at: createdAt.toISOString(),
    items: [
      { product_id: 'd0000000-0000-4000-8000-000000000001', product_name: 'Nasi Goreng', unit_price: 15000, quantity: 2, subtotal: 30000 },
      { product_id: 'd0000000-0000-4000-8000-000000000004', product_name: 'Es Teh', unit_price: 5000, quantity: 2, subtotal: 10000 },
    ],
    total: 40000,
    paid_amount: 50000,
    change_amount: 10000,
    sync_status: 'pending',
    attempts: 0,
    last_error: null,
    last_attempt_at: null,
  };
}

/** The cashier flow with a full cart: menu, order, payment (short and enough), and the sale screen. */
async function auditCashierFlow(page: Page, cashierId: string) {
  const saleId = randomUUID();
  await expect(main(page).getByRole('button', { name: /^Nasi Goreng/ })).toBeVisible();
  await audit(page, '/kasir (empty cart)');

  for (const name of ['Nasi Goreng', 'Nasi Goreng', 'Mie Goreng', 'Ayam Goreng', 'Es Teh', 'Es Jeruk', 'Kerupuk']) {
    await main(page).getByRole('button', { name: new RegExp(`^${name}`) }).click();
  }
  await expect(page.getByRole('link', { name: 'LIHAT PESANAN' })).toBeVisible();
  await audit(page, '/kasir (cart bar with 7 items)');

  await main(page).getByRole('searchbox').fill('zzz tidak ada');
  await expect(main(page).getByRole('heading', { name: 'Menu tidak ditemukan' })).toBeVisible();
  await audit(page, '/kasir (search without result)');
  await main(page).getByRole('searchbox').fill('');

  await page.getByRole('link', { name: 'LIHAT PESANAN' }).click();
  await expect(page).toHaveURL(/\/kasir\/pesanan$/);
  await expect(main(page).getByRole('link', { name: 'LANJUT BAYAR' })).toBeVisible();
  await audit(page, '/kasir/pesanan (7 lines)');

  await page.getByRole('link', { name: 'LANJUT BAYAR' }).click();
  await expect(page).toHaveURL(/\/kasir\/bayar$/);
  const paid = main(page).getByLabel('Uang diterima');
  await expect(paid).toBeVisible();
  await audit(page, '/kasir/bayar (nothing entered)');
  await paid.fill('10000');
  await expect(main(page).getByText(/Uang pembayaran kurang/)).toBeVisible();
  await audit(page, '/kasir/bayar (shortfall)');
  await paid.fill('1000000');
  await expect(main(page).getByRole('region', { name: 'Kembalian' })).toBeVisible();
  await audit(page, '/kasir/bayar (large change)');

  // The sale screen opens from a sale on this device; seed one rather than paying.
  await putOutboxEntry(page, localSale(cashierId, saleId));
  await page.goto(`/kasir/selesai?id=${saleId}`);
  await expect(page.getByRole('heading', { name: 'Transaksi Berhasil', level: 1 })).toBeVisible();
  await audit(page, '/kasir/selesai (pending sale)');
}

async function auditHistory(page: Page, pendingSaleId: string) {
  await page.goto('/riwayat');
  await expect(main(page).getByRole('heading', { name: 'Riwayat', level: 1 })).toBeVisible();
  await page.getByRole('combobox', { name: 'Filter tanggal' }).selectOption('all');
  await expect(main(page).getByRole('link', { name: /^TRX-/ }).first()).toBeVisible();
  await audit(page, '/riwayat (all dates)');

  await page.goto(`/riwayat/detail?id=${SEED_SALE}`);
  await expect(main(page).getByText('TRX-20261007-3F9A2C')).toBeVisible();
  await audit(page, '/riwayat/detail (synced sale)');

  await page.goto(`/riwayat/detail?id=${pendingSaleId}`);
  await expect(main(page).getByText('Belum tersinkron', { exact: true })).toBeVisible();
  await audit(page, '/riwayat/detail (pending sale)');
}

/** Keeps the seeded pending sale on the device: the one write path of a sale is closed. */
async function blockSaleSync(page: Page) {
  await injectFault(page, CREATE_TRANSACTION, 'http500');
}

test.beforeEach(({ allowConsoleError }) => allowConsoleError(FAILED_REQUEST, /Sync pass failed/));

test.describe('cashier', () => {
  test.beforeEach(async ({ page }) => {
    await blockSaleSync(page);
    await login(page, KASIR1.email);
  });

  test('Kasir, Pesanan, Bayar, Selesai fit the viewport', async ({ page }) => {
    await auditCashierFlow(page, KASIR1.id);
  });

  test('Riwayat, Riwayat detail, Lainnya, Tentang fit the viewport', async ({ page }) => {
    const pendingId = randomUUID();
    await putOutboxEntry(page, localSale(KASIR1.id, pendingId));
    await auditHistory(page, pendingId);

    await page.goto('/lainnya');
    await expect(main(page).getByRole('region', { name: 'Status sinkronisasi' })).toBeVisible();
    await audit(page, '/lainnya (cashier, one sale pending)');

    await page.goto('/tentang');
    await expect(main(page).getByRole('heading', { level: 1 })).toBeVisible();
    await audit(page, '/tentang');
  });

  test('the logout warning with unsynced sales fits the viewport', async ({ page }) => {
    await putOutboxEntry(page, localSale(KASIR1.id, randomUUID()));
    await page.goto('/lainnya');
    await expect(main(page).getByRole('region', { name: 'Status sinkronisasi' })).toBeVisible();
    await main(page).getByRole('button', { name: 'Keluar' }).click();
    await expect(sheet(page)).toBeVisible();
    await audit(page, 'logout dialog');
    await sheet(page).getByRole('button', { name: 'BATAL' }).click();
  });

  test('owner pages are refused with a readable message', async ({ page }) => {
    for (const path of ['/laporan', '/menu', '/pilihan', '/karyawan', '/pengaturan']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible();
      await audit(page, `${path} (denied)`);
    }
  });
});

test.describe('owner', () => {
  test.beforeEach(async ({ page }) => {
    await blockSaleSync(page);
    await login(page, OWNER.email);
  });

  test('the cashier flow, as the owner sees it', async ({ page }) => {
    await auditCashierFlow(page, OWNER.id);
  });

  test('Laporan: every period, including a custom range', async ({ page }) => {
    await openRoute(page, '/laporan', () => expect(main(page).getByRole('group', { name: 'Omzet', exact: true })).toBeVisible());
    await audit(page, '/laporan (Hari Ini)');

    for (const period of ['7 Hari', '30 Hari']) {
      await main(page).getByRole('button', { name: period, exact: true }).click();
      await expect(main(page).getByRole('group', { name: 'Omzet', exact: true })).toBeVisible();
      await audit(page, `/laporan (${period})`);
    }

    await main(page).getByRole('button', { name: 'Custom', exact: true }).click();
    await main(page).getByLabel('Dari').fill('2026-08-10');
    await main(page).getByLabel('Sampai').fill('2026-08-13');
    await expect(main(page).getByTestId('sales-chart')).toBeVisible();
    await expect(main(page).getByRole('region', { name: 'Menu Terlaris' })).toContainText('Es Teh');
    await audit(page, '/laporan (custom 10–13 Aug, with a chart)');
  });

  test('Menu, Kategori, and their sheets', async ({ page }) => {
    await openRoute(page, '/menu', () => expect(main(page).getByRole('listitem').filter({ hasText: 'Nasi Goreng' })).toBeVisible());
    await audit(page, '/menu');

    await page.getByRole('button', { name: /TAMBAH MENU/ }).click();
    await expect(sheet(page)).toBeVisible();
    await audit(page, '/menu (tambah menu sheet)');
    await sheet(page).getByRole('button', { name: 'BATAL' }).click();

    await page.getByRole('button', { name: 'Aksi untuk Nasi Goreng' }).click();
    await expect(sheet(page)).toBeVisible();
    await audit(page, '/menu (actions sheet)');
    await page.keyboard.press('Escape');

    await openRoute(page, '/pilihan', () => expect(main(page).getByRole('heading', { name: 'Belum ada pilihan menu' })).toBeVisible());
    await audit(page, '/pilihan (empty)');
    await page.getByRole('button', { name: /TAMBAH GRUP/ }).first().click();
    await expect(sheet(page)).toBeVisible();
    await audit(page, '/pilihan (tambah grup sheet)');
    await page.keyboard.press('Escape');

    await openRoute(page, '/kategori', () => expect(main(page).getByRole('listitem').filter({ hasText: 'Minuman' })).toBeVisible());
    await audit(page, '/kategori');
    await page.getByRole('button', { name: /TAMBAH KATEGORI/ }).click();
    await expect(sheet(page)).toBeVisible();
    await audit(page, '/kategori (tambah kategori sheet)');
  });

  test('Karyawan and its sheets', async ({ page }) => {
    await openRoute(page, '/karyawan', () => expect(main(page).getByRole('listitem').filter({ hasText: 'Andi' })).toBeVisible());
    await audit(page, '/karyawan');

    await page.getByRole('button', { name: /TAMBAH KASIR/ }).click();
    await expect(sheet(page)).toBeVisible();
    // The password field must stay usable and inside the sheet, with its show/hide button.
    await sheet(page).getByLabel('Password', { exact: true }).fill('a-long-password-with-many-characters-1234567890');
    await audit(page, '/karyawan (tambah kasir sheet, long password)');
    await sheet(page).getByRole('button', { name: 'BATAL' }).click();

    await page.getByRole('button', { name: 'Aksi untuk Andi' }).click();
    await expect(sheet(page)).toBeVisible();
    await audit(page, '/karyawan (actions sheet)');
    await sheet(page).getByRole('button', { name: 'Reset Password' }).click();
    await expect(sheet(page).getByLabel('Password baru')).toBeVisible();
    await audit(page, '/karyawan (reset password sheet)');
  });

  test('Pengaturan, Backup / Export, Lainnya, Tentang', async ({ page }) => {
    await openRoute(page, '/pengaturan', () => expect(main(page).getByText('Warung Makan Bu Sari')).toBeVisible());
    await audit(page, '/pengaturan');
    await page.getByRole('button', { name: 'Ubah profil warung' }).click();
    await expect(sheet(page)).toBeVisible();
    await audit(page, '/pengaturan (profil warung sheet)');
    await sheet(page).getByRole('button', { name: 'BATAL' }).click();
    await page.getByRole('button', { name: 'Ubah catatan struk' }).click();
    await expect(sheet(page)).toBeVisible();
    await audit(page, '/pengaturan (catatan struk sheet)');
    await sheet(page).getByRole('button', { name: 'BATAL' }).click();

    await openRoute(page, '/backup', () => expect(main(page).getByRole('heading', { name: 'Backup / Export', level: 1 })).toBeVisible());
    await audit(page, '/backup');

    await openRoute(page, '/lainnya', () => expect(main(page).getByRole('region', { name: 'Status sinkronisasi' })).toBeVisible());
    await audit(page, '/lainnya (owner)');

    await openRoute(page, '/tentang', () => expect(main(page).getByRole('heading', { level: 1 })).toBeVisible());
    await audit(page, '/tentang');
  });
});

test('/login fits the viewport, including its error and loading states', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'MASUK' })).toBeVisible();
  await audit(page, '/login');

  await page.getByRole('button', { name: 'MASUK' }).click();
  await expect(page.getByText('Email wajib diisi.')).toBeVisible();
  await audit(page, '/login (validation errors)');

  await page.getByLabel('Email').fill('a-very-long-email-address-that-goes-on-and-on@a-very-long-domain-name.example.com');
  await page.getByLabel('Password', { exact: true }).fill('a-very-long-password-0123456789-0123456789');
  await page.getByRole('button', { name: 'Tampilkan password' }).click();
  await audit(page, '/login (long values, password shown)');
});

test('the layout audit itself catches overflow, clipped prices, tiny and covered controls', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'MASUK' })).toBeVisible();
  expect(await layoutProblems(page), 'a healthy page reports nothing').toEqual([]);

  // Fixtures are styled through CSSOM (element.style), which the production CSP allows; an inline
  // style="" attribute would be blocked there (style-src 'self', SEC-03).
  await page.evaluate(() => {
    const add = (tag: string, id: string, text: string, css: string) => {
      const element = document.createElement(tag);
      if (id) element.id = id;
      element.textContent = text;
      element.style.cssText = css;
      document.body.append(element);
    };
    add('span', 'price', 'Rp1.250.000', 'display:block; width: 30px; overflow: hidden; white-space: nowrap');
    add('button', 'tiny', 'x', 'width: 20px; height: 20px');
    add('button', 'hidden-under-bar', 'Bayar', 'width: 120px; height: 48px');
    add('div', '', '', 'position: fixed; left: 0; right: 0; bottom: 0; top: 0; background: white; z-index: 99');
  });
  const problems = (await layoutProblems(page)).join(' | ');
  expect(problems).toContain('cuts off a price');
  expect(problems).toContain('"x" is too small to tap');
  expect(problems).toContain('#hidden-under-bar> "Bayar" is covered by');

  // Sideways overflow, on a fresh page (a phone zooms out to fit wide content).
  await page.reload();
  await expect(page.getByRole('button', { name: 'MASUK' })).toBeVisible();
  await page.evaluate(() => {
    const wide = document.createElement('div');
    wide.id = 'wide';
    wide.textContent = 'wide';
    wide.style.cssText = 'width: 3000px; height: 20px; background: red';
    document.body.append(wide);
  });
  const sideways = (await layoutProblems(page)).join(' | ');
  expect(sideways).toContain('page scrolls sideways');
  expect(sideways).toContain('"wide" sticks out sideways');
});

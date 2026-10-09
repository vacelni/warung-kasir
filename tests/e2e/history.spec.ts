import { expect, FAILED_REQUEST, test, type Locator, type Page } from './support/test';
import { CREATE_TRANSACTION, injectFault } from './support/faults';
import { goTo } from './support/offline';

// Requires the local Supabase stack with the dev seed and .env.local (see docs/RUNBOOK.md).
// Read-only: it never presses BAYAR and writes nothing to the database, so it runs once per
// viewport. Sales made by checkout are covered by history.mutation.spec.ts.
//
// Seed (store A): TRX-20261007-3F9A2C by Andi (kasir1.a) and TRX-20261007-8C41E0 by Budi
// (kasir2.a); store B: TRX-20261007-B7D209. Assertions use these rows by search and never count
// rows, because earlier mutation runs may have left more sales behind.

// The device clock is UTC: every time and date below must still read in Asia/Jakarta (TECH C.13).
test.use({ timezoneId: 'UTC' });

const PASSWORD = 'password123';
const OWNER = 'owner.a@warungkasir.test';
const CASHIER = 'kasir1.a@warungkasir.test';
const CASHIER_ID = 'a2000000-0000-4000-8000-000000000001';
const STORE_A = '5a000000-0000-4000-8000-000000000001';

const ANDI_SALE = '3f9a2c4e-7b1d-4c2a-9e10-000000000001';
const BUDI_SALE = '8c41e07a-2d3f-4b6e-8a21-000000000002';
const STORE_B_SALE = 'b7d2093e-5f4a-4e8b-9c32-000000000003';

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

async function openHistory(page: Page) {
  await goTo(page, 'Riwayat');
  await expect(page).toHaveURL(/\/riwayat$/);
  await expect(page.getByRole('heading', { name: 'Riwayat', level: 1 })).toBeVisible();
}

/** Every date, so the seeded 7 Oct sales are in range whatever day the suite runs on. */
async function showAllDates(page: Page) {
  await page.getByRole('combobox', { name: 'Filter tanggal' }).selectOption('all');
}

const search = (page: Page) => page.getByRole('searchbox', { name: 'Cari kode transaksi' });
const card = (page: Page, codePart: string) =>
  page.getByRole('main').getByRole('link', { name: new RegExp(`TRX-\\d{8}-${codePart}`) });
const rowValue = (page: Page, label: string) =>
  page.getByRole('main').getByText(label, { exact: true }).locator('xpath=following-sibling::dd');

/** Requests the app sent to the transactions table (the history list and detail reads). */
function watchTransactionReads(page: Page) {
  const urls: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (request.method() === 'GET' && url.includes('/rest/v1/transactions')) urls.push(decodeURIComponent(url));
  });
  return urls;
}

type OutboxSeed = {
  id: string;
  code: string;
  store_id: string;
  cashier_id: string;
  created_at: string;
  items: Array<{ product_id: string; product_name: string; unit_price: number; quantity: number; subtotal: number }>;
  total: number;
  paid_amount: number;
  change_amount: number;
  sync_status: 'pending' | 'syncing' | 'synced' | 'failed';
  attempts: number;
  last_error: string | null;
  last_attempt_at: string | null;
};

/** Puts sales straight into this browser's outbox, as checkout would have left them. Nothing is sent. */
function seedOutbox(page: Page, entries: OutboxSeed[]) {
  return page.evaluate(
    (rows) =>
      new Promise<void>((resolve, reject) => {
        // Same schema as lib/idb.ts, so the app opens the database untouched afterwards.
        const open = indexedDB.open('warung-kasir', 2);
        open.onupgradeneeded = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('outbox')) {
            db.createObjectStore('outbox', { keyPath: 'id' }).createIndex('by_cashier', 'cashier_id');
          }
          if (!db.objectStoreNames.contains('identity')) db.createObjectStore('identity', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('catalog')) db.createObjectStore('catalog', { keyPath: 'user_id' });
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('outbox', 'readwrite');
          for (const row of rows) tx.objectStore('outbox').put(row);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    entries,
  );
}

function localSale(id: string, status: OutboxSeed['sync_status'], createdAt: Date): OutboxSeed {
  return {
    id,
    code: `TRX-${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(createdAt).replaceAll('-', '')}-${id.slice(0, 6).toUpperCase()}`,
    store_id: STORE_A,
    cashier_id: CASHIER_ID,
    created_at: createdAt.toISOString(),
    items: [{ product_id: 'd0000000-0000-4000-8000-000000000004', product_name: 'Es Teh', unit_price: 5000, quantity: 3, subtotal: 15000 }],
    total: 15000,
    paid_amount: 20000,
    change_amount: 5000,
    sync_status: status,
    attempts: status === 'pending' ? 0 : 1,
    last_error: status === 'failed' ? 'WK002: account inactive' : null,
    last_attempt_at: status === 'pending' ? null : createdAt.toISOString(),
  };
}

test('cashier: sees only their own sales; search by code; detail shows the sale in WIB', async ({ page }) => {
  const reads = watchTransactionReads(page);
  await login(page, CASHIER);
  await openHistory(page);

  await expectTouchTarget(search(page));
  await expectTouchTarget(page.getByRole('combobox', { name: 'Filter tanggal' }));
  await expectTouchTarget(page.getByRole('combobox', { name: 'Urutan' }));
  await expect(page.getByRole('combobox', { name: 'Filter tanggal' })).toHaveValue('today');
  await expect(page.getByRole('combobox', { name: 'Urutan' })).toHaveValue('newest');

  await showAllDates(page);

  // Own sale: found by a part of its code, with time, unit count, total and cashier.
  await search(page).fill('3f9a');
  const own = card(page, '3F9A2C');
  await expect(own).toBeVisible();
  await expect(own).toContainText('TRX-20261007-3F9A2C');
  await expect(own).toContainText('10:32 • 4 item');
  await expect(own).toContainText('Rp40.000');
  await expect(own).toContainText('Kasir: Andi');
  await expect(own).not.toContainText('sinkron');
  await expect(page.getByRole('heading', { name: 'Rabu, 7 Okt 2026', level: 2 })).toBeVisible();
  await expectTouchTarget(own, 56);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // Another cashier's sale is not there: the code finds nothing for this account.
  await search(page).fill('8c41');
  await expect(page.getByRole('heading', { name: 'Transaksi tidak ditemukan' })).toBeVisible();
  await expect(card(page, '8C41E0')).toHaveCount(0);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // The search is by display code, not by the internal UUID ("7b1d" is inside the UUID only).
  await search(page).fill('7b1d');
  await expect(page.getByRole('heading', { name: 'Transaksi tidak ditemukan' })).toBeVisible();

  // The list query itself names the cashier, on top of RLS.
  await expect.poll(() => reads.some((url) => url.includes(`cashier_id=eq.${CASHIER_ID}`))).toBe(true);
  expect(reads.filter((url) => url.includes('/rest/v1/transactions?')).every((url) => url.includes(`cashier_id=eq.${CASHIER_ID}`))).toBe(true);

  // Open the detail from the list.
  await search(page).fill('3f9a');
  await card(page, '3F9A2C').click();
  await expect(page).toHaveURL(new RegExp(`/riwayat/detail\\?id=${ANDI_SALE}$`));
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Detail Transaksi', level: 1 })).toBeVisible();
  await expect(main.getByText('TRX-20261007-3F9A2C')).toBeVisible();
  await expect(main.getByRole('listitem')).toHaveText([
    'Es TehRp5.000 × 2Rp10.000',
    'Nasi GorengRp15.000 × 2Rp30.000',
  ]);
  await expect(rowValue(page, 'Total')).toHaveText('Rp40.000');
  await expect(rowValue(page, 'Bayar')).toHaveText('Rp50.000');
  await expect(rowValue(page, 'Kembalian')).toHaveText('Rp10.000');
  await expect(rowValue(page, 'Kasir')).toHaveText('Andi');
  // Sale time 10:32 WIB, though the device clock is UTC (03:32).
  await expect(rowValue(page, 'Tanggal')).toHaveText('07/10/2026');
  await expect(rowValue(page, 'Waktu')).toHaveText('10:32 WIB');
  await expect(main.getByText('Selesai', { exact: true })).toBeVisible();
  await expect(main.getByText('Tersinkron', { exact: true })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await expectTouchTarget(main.getByRole('link', { name: 'Kembali ke riwayat' }), 44);

  // Typing the URL of another cashier's sale (or another store's) shows nothing.
  for (const id of [BUDI_SALE, STORE_B_SALE]) {
    await page.goto(`/riwayat/detail?id=${id}`);
    await expect(page.getByRole('heading', { name: 'Transaksi tidak ditemukan' })).toBeVisible();
    await expect(page.getByRole('main').getByText(/TRX-/)).toHaveCount(0);
  }
  await page.goto('/riwayat/detail?id=bukan-uuid');
  await expect(page.getByRole('heading', { name: 'Transaksi tidak ditemukan' })).toBeVisible();

  // Back to the list.
  await page.goto(`/riwayat/detail?id=${ANDI_SALE}`);
  await page.getByRole('link', { name: 'Kembali ke riwayat' }).click();
  await expect(page).toHaveURL(/\/riwayat$/);
});

test('owner: sees every cashier of the store, newest or oldest first, never another store', async ({ page }) => {
  const reads = watchTransactionReads(page);
  await login(page, OWNER);
  await openHistory(page);
  await showAllDates(page);

  // Both cashiers' sales of store A, one search for the whole day of the seed.
  await search(page).fill('TRX-20261007');
  await expect(card(page, '3F9A2C')).toContainText('Kasir: Andi');
  await expect(card(page, '8C41E0')).toContainText('Kasir: Budi');
  await expect(card(page, '8C41E0')).toContainText('12:05 • 2 item');
  await expect(card(page, '8C41E0')).toContainText('Rp25.000');
  await expect(card(page, 'B7D209')).toHaveCount(0);

  // Newest first by default: 12:05 comes before 10:32. Oldest first reverses them.
  const order = async () =>
    (await page.getByRole('main').getByRole('link', { name: /^TRX-20261007-/ }).allTextContents()).map(
      (text) => /TRX-20261007-(\w{6})/.exec(text)?.[1],
    );
  // Polled: the cards above may still be those of the unfiltered list while the search loads.
  await expect.poll(order).toEqual(['8C41E0', '3F9A2C']);
  await page.getByRole('combobox', { name: 'Urutan' }).selectOption('oldest');
  await expect.poll(order).toEqual(['3F9A2C', '8C41E0']);

  // Another store's code finds nothing.
  await search(page).fill('b7d2');
  await expect(page.getByRole('heading', { name: 'Transaksi tidak ditemukan' })).toBeVisible();

  // The owner is not narrowed to a cashier.
  expect(reads.filter((url) => url.includes('/rest/v1/transactions?'))).not.toHaveLength(0);
  expect(reads.some((url) => url.includes('cashier_id=eq.'))).toBe(false);

  // Detail of a cashier's sale shows that cashier; another store's sale is not found.
  await search(page).fill('8c41');
  await card(page, '8C41E0').click();
  await expect(page).toHaveURL(new RegExp(`/riwayat/detail\\?id=${BUDI_SALE}$`));
  await expect(rowValue(page, 'Kasir')).toHaveText('Budi');
  await expect(rowValue(page, 'Total')).toHaveText('Rp25.000');
  await expect(rowValue(page, 'Waktu')).toHaveText('12:05 WIB');
  await expect(page.getByRole('main').getByRole('listitem')).toHaveText([
    'Ayam GorengRp18.000 × 1Rp18.000',
    'Es JerukRp7.000 × 1Rp7.000',
  ]);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await page.goto(`/riwayat/detail?id=${STORE_B_SALE}`);
  await expect(page.getByRole('heading', { name: 'Transaksi tidak ditemukan' })).toBeVisible();
});

test('this device’s unsynced sales show in history and detail, even when the server cannot be reached', async ({ page, allowConsoleError }) => {
  allowConsoleError(FAILED_REQUEST, /Could not load the transaction|Sync pass/);
  // The seeded sales must stay on the device: close the one write path so the app cannot send them.
  await injectFault(page, CREATE_TRANSACTION, 'http500');
  await login(page, CASHIER);
  const now = Date.now();
  const pendingId = 'a1b2c3d4-0000-4000-8000-0000000000a1';
  const failedId = 'd4c3b2a1-0000-4000-8000-0000000000a2';
  const pending = localSale(pendingId, 'pending', new Date(now - 60_000));
  const failed = localSale(failedId, 'failed', new Date(now - 120_000));
  await seedOutbox(page, [pending, failed]);

  // The server is unreachable for every transaction read (offline).
  await page.route('**/rest/v1/transactions*', (route) => route.abort('connectionrefused'));
  await openHistory(page);

  await expect(page.getByText(/Riwayat dari server tidak dapat dimuat/)).toBeVisible();
  const pendingCard = card(page, pendingId.slice(0, 6).toUpperCase());
  const failedCard = card(page, failedId.slice(0, 6).toUpperCase());
  await expect(pendingCard).toContainText('Belum tersinkron');
  await expect(pendingCard).toContainText('Rp15.000');
  await expect(pendingCard).toContainText('3 item');
  await expect(pendingCard).toContainText('Kasir: Andi');
  await expect(failedCard).toContainText('Gagal sinkron');
  // Newest first: the pending sale (1 minute ago) is above the failed one (2 minutes ago).
  const codes = await page.getByRole('main').getByRole('link', { name: /^TRX-/ }).allTextContents();
  const position = (id: string) => codes.findIndex((text) => text.includes(id.slice(0, 6).toUpperCase()));
  expect(position(pendingId)).toBeGreaterThanOrEqual(0);
  expect(position(pendingId)).toBeLessThan(position(failedId));
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // Search by code still works on the device's own sales.
  await search(page).fill(failedId.slice(0, 6));
  await expect(failedCard).toBeVisible();
  await expect(pendingCard).toHaveCount(0);
  await search(page).fill('');

  // The pending sale opens from the local snapshot with no server row.
  await pendingCard.click();
  await expect(page).toHaveURL(new RegExp(`/riwayat/detail\\?id=${pendingId}$`));
  const main = page.getByRole('main');
  await expect(main.getByText(pending.code)).toBeVisible();
  await expect(main.getByText('Belum tersinkron', { exact: true })).toBeVisible();
  await expect(main.getByText(/belum diterima server/)).toBeVisible();
  await expect(main.getByText('Selesai', { exact: true })).toHaveCount(0);
  await expect(main.getByRole('listitem')).toHaveText(['Es TehRp5.000 × 3Rp15.000']);
  await expect(rowValue(page, 'Total')).toHaveText('Rp15.000');
  await expect(rowValue(page, 'Bayar')).toHaveText('Rp20.000');
  await expect(rowValue(page, 'Kembalian')).toHaveText('Rp5.000');
  await expect(rowValue(page, 'Kasir')).toHaveText('Andi');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // The failed sale is kept and explained.
  await page.getByRole('link', { name: 'Kembali ke riwayat' }).click();
  await failedCard.click();
  await expect(main.getByText('Gagal sinkron', { exact: true })).toBeVisible();
  await expect(main.getByText(/Server menolak transaksi ini/)).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('custom date range: whole WIB days of the seed, an unusable range is explained (UI_SPEC A.15)', async ({ page }) => {
  await login(page, OWNER);
  await openHistory(page);
  await page.getByRole('combobox', { name: 'Filter tanggal' }).selectOption('custom');

  // 7 Oct 2026 (WIB), the day of the seed's store A sales.
  await page.getByLabel('Dari tanggal').fill('2026-10-07');
  await page.getByLabel('Sampai tanggal').fill('2026-10-07');
  await expect(card(page, '3F9A2C')).toBeVisible();
  await expect(card(page, '8C41E0')).toBeVisible();

  // The day before holds none of them.
  await page.getByLabel('Dari tanggal').fill('2026-10-06');
  await page.getByLabel('Sampai tanggal').fill('2026-10-06');
  await expect(card(page, '3F9A2C')).toHaveCount(0);

  // From after to: a message, no list.
  await page.getByLabel('Dari tanggal').fill('2026-10-08');
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Tanggal awal tidak boleh setelah tanggal akhir.');
  await expect(page.getByRole('main').getByRole('link', { name: /TRX-/ })).toHaveCount(0);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('receipt view: LIHAT STRUK shows the store header, the sale and the receipt note (UI_SPEC A.15)', async ({ page }) => {
  await login(page, CASHIER);
  await page.goto(`/riwayat/detail?id=${ANDI_SALE}`);
  await page.getByRole('button', { name: 'LIHAT STRUK' }).click();

  const receipt = page.getByRole('region', { name: 'Struk' });
  await expect(receipt).toContainText('Warung Makan Bu Sari');
  await expect(receipt).toContainText('Jl. Contoh No. 10, Semarang');
  await expect(receipt).toContainText('TRX-20261007-3F9A2C');
  await expect(receipt).toContainText('Terima kasih :)');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await page.getByRole('button', { name: 'TUTUP STRUK' }).click();
  await expect(receipt).toHaveCount(0);
});

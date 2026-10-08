import { expect, test, type Page } from '@playwright/test';

// Requires the local Supabase stack with the dev seed and .env.local (see docs/RUNBOOK.md).
// Saves real sales for kasir1.a, so it runs in the serial "mutations" project after every
// read-only spec (see playwright.config.ts). Each test finds its own sales by UUID or code and
// never counts rows. Reset the local database afterwards with `npx supabase db reset`.

const PASSWORD = 'password123';
const CASHIER = 'kasir1.a@warungkasir.test';
const CASHIER_ID = 'a2000000-0000-4000-8000-000000000001';
const STORE_A = '5a000000-0000-4000-8000-000000000001';
const RPC = '/rest/v1/rpc/create_transaction';
const NASI_GORENG = 'd0000000-0000-4000-8000-000000000001';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'MASUK' }).click();
  await expect(page).toHaveURL(/\/kasir$/);
}

const card = (page: Page, name: string) => page.getByRole('main').getByRole('button', { name: new RegExp(`^${name}`) });
const historyCard = (page: Page, code: string) => page.getByRole('main').getByRole('link', { name: new RegExp(code) });
const rowValue = (page: Page, label: string) =>
  page.getByRole('main').getByText(label, { exact: true }).locator('xpath=following-sibling::dd');
const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('link', { name });

async function openPayment(page: Page, products: string[]) {
  for (const name of products) await card(page, name).click();
  await page.getByRole('link', { name: 'LIHAT PESANAN' }).click();
  await page.getByRole('link', { name: 'LANJUT BAYAR' }).click();
  await expect(page).toHaveURL(/\/kasir\/bayar$/);
}

/** Pays exactly the total and returns the id and display code of the sale from the success screen. */
async function payExact(page: Page) {
  const main = page.getByRole('main');
  await main.getByRole('group', { name: 'Nominal cepat' }).getByRole('button', { name: 'UANG PAS' }).click();
  await main.getByRole('button', { name: 'BAYAR' }).click();
  await expect(page.getByRole('heading', { name: 'Transaksi Berhasil', level: 1 })).toBeVisible();
  const id = new URL(page.url()).searchParams.get('id')!;
  return { id, code: `TRX-${jakartaDate(new Date())}-${id.slice(0, 6).toUpperCase()}` };
}

const jakartaDate = (instant: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(instant)
    .replaceAll('-', '');

const jakartaDdMmYyyy = (instant: Date) => {
  const key = jakartaDate(instant);
  return `${key.slice(6, 8)}/${key.slice(4, 6)}/${key.slice(0, 4)}`;
};

type OutboxRow = {
  id: string;
  created_at: string;
  sync_status: string;
  attempts: number;
  cashier_id: string;
};

/** Every outbox entry in this browser's IndexedDB. */
function outboxEntries(page: Page) {
  return page.evaluate(
    () =>
      new Promise<OutboxRow[]>((resolve, reject) => {
        const open = indexedDB.open('warung-kasir');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const read = db.transaction('outbox').objectStore('outbox').getAll();
          read.onerror = () => reject(read.error);
          read.onsuccess = () => {
            resolve(read.result as OutboxRow[]);
            db.close();
          };
        };
      }),
  );
}

test('golden path (G.15): pay, then find the sale in Riwayat, open it, and check every value', async ({ page }) => {
  await login(page, CASHIER);
  await openPayment(page, ['Nasi Goreng', 'Nasi Goreng', 'Es Teh', 'Es Teh']);

  const main = page.getByRole('main');
  const paid = main.getByLabel('Uang diterima');
  await paid.fill('50000');
  await expect(main.getByRole('region', { name: 'Kembalian' })).toContainText('Rp10.000');
  await main.getByRole('button', { name: 'BAYAR' }).click();

  await expect(page.getByRole('heading', { name: 'Transaksi Berhasil', level: 1 })).toBeVisible();
  await expect(main.getByText('Tersinkron')).toBeVisible();
  const id = new URL(page.url()).searchParams.get('id')!;
  const code = `TRX-${jakartaDate(new Date())}-${id.slice(0, 6).toUpperCase()}`;
  await expect(main.getByText(code, { exact: true })).toBeVisible();

  // Riwayat (AC-06): the new sale is listed under today, with the right values and no badge.
  await nav(page, 'Riwayat').click();
  await expect(page).toHaveURL(/\/riwayat$/);
  const listed = historyCard(page, code);
  await expect(listed).toBeVisible();
  await expect(listed).toContainText('4 item');
  await expect(listed).toContainText('Rp40.000');
  await expect(listed).toContainText('Kasir: Andi');
  await expect(listed).not.toContainText('sinkron');
  // Exactly one card for this sale: the device copy and the server row are one. (Other mutation
  // specs save sales for the same cashier at the same time, so this test never assumes it is first;
  // the paging test checks the order of its own sales.)
  await expect(listed).toHaveCount(1);

  // Open the sale and check every value.
  await listed.click();
  await expect(page).toHaveURL(new RegExp(`/riwayat/detail\\?id=${id}$`));
  await expect(main.getByText(code, { exact: true })).toBeVisible();
  await expect(main.getByRole('listitem')).toHaveText([
    'Es TehRp5.000 × 2Rp10.000',
    'Nasi GorengRp15.000 × 2Rp30.000',
  ]);
  await expect(rowValue(page, 'Total')).toHaveText('Rp40.000');
  await expect(rowValue(page, 'Bayar')).toHaveText('Rp50.000');
  await expect(rowValue(page, 'Kembalian')).toHaveText('Rp10.000');
  await expect(rowValue(page, 'Kasir')).toHaveText('Andi');
  await expect(rowValue(page, 'Tanggal')).toHaveText(jakartaDdMmYyyy(new Date()));
  await expect(rowValue(page, 'Waktu')).toHaveText(/^\d{2}:\d{2} WIB$/);
  await expect(main.getByText('Selesai', { exact: true })).toBeVisible();
  await expect(main.getByText('Tersinkron', { exact: true })).toBeVisible();

  // The device copy is synced too.
  expect(await outboxEntries(page)).toEqual([expect.objectContaining({ id, sync_status: 'synced' })]);
});

test('a sale the server has not received shows as pending at once, then becomes one synced card (no duplicate)', async ({
  page,
}) => {
  await login(page, CASHIER);

  // First sale: the server never answers (the response is lost), so it stays on the device.
  await page.route(`**${RPC}`, (route) => route.abort('connectionreset'));
  await openPayment(page, ['Es Jeruk']);
  const first = await payExact(page);
  const main = page.getByRole('main');
  await expect(main.getByText('Tersimpan • Menunggu sinkronisasi')).toBeVisible();

  // Success screen → LIHAT DETAIL: the sale opens from the device, with no server row.
  await main.getByRole('link', { name: 'LIHAT DETAIL' }).click();
  await expect(page).toHaveURL(new RegExp(`/riwayat/detail\\?id=${first.id}$`));
  await expect(main.getByText(first.code, { exact: true })).toBeVisible();
  await expect(main.getByText('Belum tersinkron', { exact: true })).toBeVisible();
  await expect(main.getByText('Selesai', { exact: true })).toHaveCount(0);
  await expect(rowValue(page, 'Total')).toHaveText('Rp7.000');
  await expect(main.getByRole('listitem')).toHaveText(['Es JerukRp7.000 × 1Rp7.000']);

  // Riwayat shows it as unsynced even though the server list does not have it.
  await nav(page, 'Riwayat').click();
  await expect(historyCard(page, first.code)).toContainText('Belum tersinkron');
  await expect(historyCard(page, first.code)).toContainText('Rp7.000');
  await expect(historyCard(page, first.code)).toHaveCount(1);

  // The connection is back. A second sale's sync sends both pending sales, oldest first.
  await page.unroute(`**${RPC}`);
  await nav(page, 'Kasir').click();
  await openPayment(page, ['Kerupuk']);
  const second = await payExact(page);
  await expect(main.getByText('Tersinkron')).toBeVisible();

  const entries = await outboxEntries(page);
  expect(entries.map((entry) => [entry.id, entry.sync_status]).sort()).toEqual(
    [
      [first.id, 'synced'],
      [second.id, 'synced'],
    ].sort(),
  );

  // Riwayat now converges on the server rows: one card per sale, no badge, no duplicate.
  await nav(page, 'Riwayat').click();
  for (const sale of [first, second]) {
    await expect(historyCard(page, sale.code)).toHaveCount(1);
    await expect(historyCard(page, sale.code)).not.toContainText('sinkron');
  }

  // The first sale's detail now comes from the server.
  await historyCard(page, first.code).click();
  await expect(main.getByText('Selesai', { exact: true })).toBeVisible();
  await expect(main.getByText('Tersinkron', { exact: true })).toBeVisible();
  await expect(main.getByText('Belum tersinkron', { exact: true })).toHaveCount(0);
  await expect(rowValue(page, 'Total')).toHaveText('Rp7.000');
});

test('paging: more than one page of sales loads page by page with no repeat and no gap, in order', async ({ page }) => {
  await login(page, CASHIER);

  // One real sale first, so the app has created its outbox.
  await openPayment(page, ['Nasi Goreng']);
  const real = await payExact(page);

  // 24 more sales left on the device by earlier checkouts: groups of four share the same sale
  // minute, so the cursor must break ties by id. The next real checkout's sync sends them all.
  const now = Date.now();
  const injected = Array.from({ length: 24 }, (_, index) => {
    const id = crypto.randomUUID();
    const createdAt = new Date(Math.floor(now / 60_000) * 60_000 - (Math.floor(index / 4) + 1) * 60_000);
    return {
      id,
      code: `TRX-${jakartaDate(createdAt)}-${id.slice(0, 6).toUpperCase()}`,
      store_id: STORE_A,
      cashier_id: CASHIER_ID,
      created_at: createdAt.toISOString(),
      items: [{ product_id: NASI_GORENG, product_name: 'Nasi Goreng', unit_price: 15000, quantity: 1, subtotal: 15000 }],
      total: 15000,
      paid_amount: 20000,
      change_amount: 5000,
      sync_status: 'pending',
      attempts: 0,
      last_error: null,
      last_attempt_at: null,
    };
  });
  await page.evaluate(
    (rows) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('warung-kasir');
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
    injected,
  );

  await nav(page, 'Kasir').click();
  await openPayment(page, ['Es Teh']);
  const last = await payExact(page);
  await expect(page.getByRole('main').getByText('Tersinkron')).toBeVisible();

  const synced = await outboxEntries(page);
  expect(synced).toHaveLength(26);
  expect(synced.every((entry) => entry.sync_status === 'synced')).toBe(true);
  const mine = new Set([real.id, last.id, ...injected.map((entry) => entry.id)]);
  expect(mine.size).toBe(26);

  // Riwayat, every date, newest first. More than one page exists now.
  await nav(page, 'Riwayat').click();
  const main = page.getByRole('main');
  await page.getByRole('combobox', { name: 'Filter tanggal' }).selectOption('all');
  const cards = main.getByRole('link', { name: /^TRX-/ });
  await expect(cards).toHaveCount(20);
  const loadMore = main.getByRole('button', { name: 'MUAT LEBIH BANYAK' });
  await expect(loadMore).toBeVisible();

  // Page until the end, one page per click.
  let shown = 20;
  while (await loadMore.isVisible()) {
    const before = shown;
    await loadMore.click();
    await expect.poll(async () => cards.count()).toBeGreaterThan(before);
    shown = await cards.count();
    expect(shown - before).toBeLessThanOrEqual(20);
  }
  await expect(loadMore).toHaveCount(0);
  expect(shown).toBeGreaterThanOrEqual(26);

  // No repeat: every card is a different sale. No gap: all 26 of ours are there.
  const ids = await cards.evaluateAll((links) =>
    links.map((link) => new URL((link as HTMLAnchorElement).href).searchParams.get('id')!),
  );
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of mine) expect(ids).toContain(id);

  // Order: by sale time, newest first, ties by id descending, across the page boundary.
  const expectedOrder = [...synced]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || (a.id < b.id ? 1 : -1))
    .map((entry) => entry.id);
  expect(ids.filter((id) => mine.has(id))).toEqual(expectedOrder);

  // None of them is flagged as unsynced.
  await expect(main.getByText('Belum tersinkron')).toHaveCount(0);

  // Oldest first reverses it and pages again from the start.
  await page.getByRole('combobox', { name: 'Urutan' }).selectOption('oldest');
  await expect(cards).toHaveCount(20);
  while (await loadMore.isVisible()) {
    const before = await cards.count();
    await loadMore.click();
    await expect.poll(async () => cards.count()).toBeGreaterThan(before);
  }
  const oldestIds = await cards.evaluateAll((links) =>
    links.map((link) => new URL((link as HTMLAnchorElement).href).searchParams.get('id')!),
  );
  expect(new Set(oldestIds).size).toBe(oldestIds.length);
  expect(oldestIds.filter((id) => mine.has(id))).toEqual([...expectedOrder].reverse());
});

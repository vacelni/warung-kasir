import { expect, FAILED_REQUEST, test, type Page, type Request } from './support/test';

// Requires the local Supabase stack with the dev seed and .env.local (see docs/RUNBOOK.md).
// Saves real sales for kasir1.a, so it runs in the serial "mutations" project after every
// read-only spec (see playwright.config.ts). Each test reads back only its own sale (by UUID).
// Reset the local database afterwards with `npx supabase db reset` to drop the test sales.

const PASSWORD = 'password123';
const CASHIER = 'kasir1.a@warungkasir.test';
const CASHIER_ID = 'a2000000-0000-4000-8000-000000000001';
const STORE_A = '5a000000-0000-4000-8000-000000000001';
const RPC = '/rest/v1/rpc/create_transaction';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'MASUK' }).click();
  await expect(page).toHaveURL(/\/kasir$/);
}

const card = (page: Page, name: string) => page.getByRole('main').getByRole('button', { name: new RegExp(`^${name}`) });

async function openPayment(page: Page, products: string[]) {
  for (const name of products) await card(page, name).click();
  await page.getByRole('link', { name: 'LIHAT PESANAN' }).click();
  await page.getByRole('link', { name: 'LANJUT BAYAR' }).click();
  await expect(page).toHaveURL(/\/kasir\/bayar$/);
}

/** Every outbox entry in this browser's IndexedDB. */
function outboxEntries(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        const open = indexedDB.open('warung-kasir');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const read = db.transaction('outbox').objectStore('outbox').getAll();
          read.onerror = () => reject(read.error);
          read.onsuccess = () => {
            resolve(read.result as Array<Record<string, unknown>>);
            db.close();
          };
        };
      }),
  );
}

type ServerTransaction = {
  id: string;
  store_id: string;
  cashier_id: string;
  code: string;
  total: number;
  paid_amount: number;
  change_amount: number;
  status: string;
  created_at: string;
  synced_at: string;
  transaction_items: Array<{ product_name: string; unit_price: number; quantity: number; subtotal: number }>;
};

/** Reads the sale back from the database as the cashier (RLS), with the app's own credentials. */
async function serverTransactions(page: Page, rpcRequest: Request, id: string): Promise<ServerTransaction[]> {
  const headers = await rpcRequest.allHeaders();
  const url = new URL('/rest/v1/transactions', rpcRequest.url());
  url.searchParams.set('id', `eq.${id}`);
  url.searchParams.set('select', '*,transaction_items(product_name,unit_price,quantity,subtotal)');
  const response = await page.request.get(url.toString(), {
    headers: { apikey: headers.apikey!, authorization: headers.authorization! },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as ServerTransaction[];
}

const jakartaToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date())
    .replaceAll('-', '');

test('golden path: pay with a double tap, one sale saved and synced, Transaksi Baru starts empty (AC-04, AC-12)', async ({
  page,
}) => {
  await login(page, CASHIER);
  await openPayment(page, ['Nasi Goreng', 'Nasi Goreng', 'Es Teh', 'Es Teh']);

  const rpcRequests: Request[] = [];
  page.on('request', (request) => {
    if (request.url().includes(RPC)) rpcRequests.push(request);
  });

  const main = page.getByRole('main');
  const paid = main.getByLabel('Uang diterima');
  const pay = main.getByRole('button', { name: 'BAYAR' });
  await expect(paid).toHaveAttribute('inputmode', 'numeric');

  // Insufficient payment cannot be submitted (AC-05).
  await paid.fill('30000');
  await expect(main.getByText('Uang pembayaran kurang Rp10.000')).toBeVisible();
  await expect(pay).toBeDisabled();

  await paid.fill('50000');
  await expect(main.getByRole('region', { name: 'Kembalian' })).toContainText('Rp10.000');

  const rpcResponse = page.waitForResponse((response) => response.url().includes(RPC));
  await pay.dblclick();

  // Success screen (UI_SPEC A.14).
  await expect(page).toHaveURL(/\/kasir\/selesai\?id=[0-9a-f-]{36}$/);
  const id = new URL(page.url()).searchParams.get('id')!;
  await expect(page.getByRole('heading', { name: 'Transaksi Berhasil', level: 1 })).toBeVisible();
  const code = `TRX-${jakartaToday()}-${id.slice(0, 6).toUpperCase()}`;
  await expect(main.getByText(code, { exact: true })).toBeVisible();
  await expect(main.getByText('Total', { exact: true }).locator('xpath=following-sibling::dd')).toHaveText('Rp40.000');
  await expect(main.getByText('Dibayar', { exact: true }).locator('xpath=following-sibling::dd')).toHaveText('Rp50.000');
  await expect(main.getByText('Kembalian', { exact: true }).locator('xpath=following-sibling::dd')).toHaveText('Rp10.000');
  await expect(main.getByText('Tersinkron')).toBeVisible();

  // One tap's worth of sale: one outbox entry, one RPC call, with the UUID shown in the URL.
  expect(await (await rpcResponse).json()).toBe('created');
  expect(rpcRequests).toHaveLength(1);
  const rpcRequest = rpcRequests[0]!;
  const body = rpcRequest.postDataJSON() as Record<string, unknown>;
  expect(body).toMatchObject({ p_id: id, p_code: code, p_total: 40000, p_paid_amount: 50000, p_change_amount: 10000 });
  expect(body).not.toHaveProperty('p_store_id');
  expect(body).not.toHaveProperty('p_cashier_id');

  const entries = await outboxEntries(page);
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({ id, sync_status: 'synced', attempts: 1 });

  // Persisted through the RPC: one row, identity from the session, sale time kept, synced_at from the server.
  const rows = await serverTransactions(page, rpcRequest, id);
  expect(rows).toHaveLength(1);
  const [row] = rows as [ServerTransaction];
  expect(row).toMatchObject({
    store_id: STORE_A,
    cashier_id: CASHIER_ID,
    code,
    total: 40000,
    paid_amount: 50000,
    change_amount: 10000,
    status: 'completed',
  });
  expect(Date.parse(row.created_at)).toBe(Date.parse(String(entries[0]!.created_at)));
  expect(Date.parse(row.synced_at)).toBeGreaterThanOrEqual(Date.parse(row.created_at));
  expect(row.transaction_items.sort((a, b) => b.unit_price - a.unit_price)).toEqual([
    { product_name: 'Nasi Goreng', unit_price: 15000, quantity: 2, subtotal: 30000 },
    { product_name: 'Es Teh', unit_price: 5000, quantity: 2, subtotal: 10000 },
  ]);

  // Transaksi Baru: back on the menu with an empty cart.
  await main.getByRole('button', { name: 'TRANSAKSI BARU' }).click();
  await expect(page).toHaveURL(/\/kasir$/);
  await expect(card(page, 'Nasi Goreng')).toBeVisible();
  await expect(page.getByRole('link', { name: 'LIHAT PESANAN' })).toHaveCount(0);
  await expect(card(page, 'Nasi Goreng')).not.toContainText('di pesanan');

  // Going Back from the menu cannot resubmit the paid order.
  await page.goBack();
  await expect(page).toHaveURL(/\/kasir\/selesai\?id=/);
  await page.goBack();
  await expect(page.getByRole('button', { name: 'BAYAR' })).toHaveCount(0);
  expect(rpcRequests).toHaveLength(1);
});

test('lost response: the server saved the sale, the retry sends the same UUID and gets exists (G.11)', async ({ page, allowConsoleError }) => {
  allowConsoleError(FAILED_REQUEST); // the response this test drops on purpose
  await login(page, CASHIER);
  await openPayment(page, ['Es Jeruk']);

  // First call: the server commits the sale, but the device never hears back.
  const sentBodies: Array<Record<string, unknown>> = [];
  let dropped = false;
  await page.route(`**${RPC}`, async (route) => {
    sentBodies.push(route.request().postDataJSON() as Record<string, unknown>);
    if (!dropped) {
      dropped = true;
      await route.fetch();
      await route.abort('connectionreset');
      return;
    }
    await route.continue();
  });

  const main = page.getByRole('main');
  await main.getByRole('group', { name: 'Nominal cepat' }).getByRole('button', { name: 'UANG PAS' }).click();
  await main.getByRole('button', { name: 'BAYAR' }).click();

  await expect(page.getByRole('heading', { name: 'Transaksi Berhasil', level: 1 })).toBeVisible();
  const id = new URL(page.url()).searchParams.get('id')!;
  await expect(main.getByText('Tersimpan • Menunggu sinkronisasi')).toBeVisible();
  expect(await outboxEntries(page)).toEqual([expect.objectContaining({ id, sync_status: 'pending', attempts: 1 })]);

  const retryResponse = page.waitForResponse((response) => response.url().includes(RPC));
  await main.getByRole('button', { name: 'COBA LAGI' }).click();
  const retry = await retryResponse;
  expect(await retry.json()).toBe('exists');
  await expect(main.getByText('Tersinkron')).toBeVisible();

  // Same UUID and sale time on both attempts; exactly one sale on the server.
  expect(sentBodies).toHaveLength(2);
  expect(sentBodies[1]).toEqual(sentBodies[0]);
  expect(sentBodies[0]).toMatchObject({ p_id: id, p_total: 7000, p_paid_amount: 7000, p_change_amount: 0 });
  expect(await outboxEntries(page)).toEqual([expect.objectContaining({ id, sync_status: 'synced', attempts: 2 })]);

  const rows = await serverTransactions(page, retry.request(), id);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ cashier_id: CASHIER_ID, total: 7000, paid_amount: 7000, change_amount: 0 });
});

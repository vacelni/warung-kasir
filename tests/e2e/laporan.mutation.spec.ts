import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from './support/test';

// Requires the local Supabase stack with the dev seed and .env.local (see docs/RUNBOOK.md).
// Saves real sales for kasir1.a, so it runs in the serial "mutations" project after every
// read-only spec (see playwright.config.ts). Other mutation specs sell at the same time, so a
// check on "today" compares against a lower bound, while the exact-number check uses a past day
// (20 Jun 2026) that only this spec writes to and compares the owner's numbers before and after.
// Reset the local database afterwards with `npx supabase db reset`.

const PASSWORD = 'password123';
const OWNER = 'owner.a@warungkasir.test';
const CASHIER = 'kasir1.a@warungkasir.test';
const NASI_GORENG = 'd0000000-0000-4000-8000-000000000001';
const NASI_GORENG_PRICE = 15000;

// 12:00 WIB on 20 Jun 2026 is 05:00Z: the 12:00 hour bucket of that Jakarta day.
const PAST_DAY = '2026-06-20';
const PAST_SALE_TIME = '2026-06-20T05:00:00.000Z';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'MASUK' }).click();
  await expect(page).toHaveURL(/\/kasir$/);
}

const main = (page: Page) => page.getByRole('main');
const metric = (page: Page, name: string) => main(page).getByRole('group', { name, exact: true });

/** "Rp1.250.000" or "12" → the whole number in it. */
const toNumber = (text: string) => Number(text.replace(/\D/g, ''));

async function openLaporan(page: Page) {
  await page.goto('/laporan');
  await expect(page.getByRole('heading', { name: 'Laporan', level: 1 })).toBeVisible();
  await expect(metric(page, 'Omzet')).toBeVisible();
}

async function showDay(page: Page, day: string) {
  await main(page).getByRole('button', { name: 'Custom', exact: true }).click();
  await main(page).getByLabel('Dari tanggal').fill(day);
  await main(page).getByLabel('Sampai tanggal').fill(day);
  // The heading shows the day only once the numbers for exactly this day have loaded.
  await expect(main(page).getByText('Sabtu, 20 Jun 2026')).toBeVisible();
}

/** The four metrics and the chart bars as numbers, once the dashboard has finished loading. */
async function readDashboard(page: Page) {
  await expect(metric(page, 'Omzet')).toBeVisible();
  const read = async (name: string) => toNumber((await metric(page, name).locator('p').first().textContent()) ?? '');
  const bars = await page
    .getByTestId('sales-chart')
    .locator('rect[data-bar]')
    .evaluateAll((els) => els.map((el) => Number(el.getAttribute('data-revenue'))));
  return {
    revenue: await read('Omzet'),
    count: await read('Transaksi'),
    items: await read('Item Terjual'),
    average: await read('Rata-rata Transaksi'),
    bars,
  };
}

/** Supabase URL and publishable key for the direct request below, read the way the app reads them. */
function supabaseEnv(): { url: string; key: string } {
  let file = '';
  try {
    file = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
  } catch {
    // Fall back to the process environment (CI).
  }
  const read = (name: string) =>
    new RegExp(`^${name}=(.*)$`, 'm').exec(file)?.[1]?.trim() ?? process.env[name] ?? '';
  return { url: read('NEXT_PUBLIC_SUPABASE_URL'), key: read('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') };
}

/**
 * Sends one sale to create_transaction with the signed-in cashier's own session: the call a device
 * makes when it syncs its outbox, here with a chosen sale time on a past day.
 */
async function syncSale(page: Page, sale: { id: string; createdAt: string; quantity: number }) {
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
    const session = key ? (JSON.parse(localStorage.getItem(key) ?? 'null') as { access_token?: string } | null) : null;
    return session?.access_token ?? null;
  });
  expect(token, 'the cashier has a stored session').not.toBeNull();

  const total = sale.quantity * NASI_GORENG_PRICE;
  const { url, key } = supabaseEnv();
  const response = await page.request.post(`${url}/rest/v1/rpc/create_transaction`, {
    headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      p_id: sale.id,
      p_code: `TRX-${PAST_DAY.replaceAll('-', '')}-${sale.id.slice(0, 6).toUpperCase()}`,
      p_created_at: sale.createdAt,
      p_total: total,
      p_paid_amount: total,
      p_change_amount: 0,
      p_items: [
        {
          product_id: NASI_GORENG,
          product_name: 'Nasi Goreng',
          unit_price: NASI_GORENG_PRICE,
          quantity: sale.quantity,
          subtotal: total,
        },
      ],
    },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toBe('created');
}

test('exact numbers: a synced sale on a past day adds its omzet, items and hour to the owner dashboard', async ({
  browser,
  baseURL,
}) => {
  // Two signed-in users at once, so two contexts; a context made by hand does not inherit the project's options.
  const options = { baseURL, viewport: { width: 360, height: 800 } };
  const ownerContext = await browser.newContext({ ...options, timezoneId: 'UTC' });
  const cashierContext = await browser.newContext(options);
  try {
    const owner = await ownerContext.newPage();
    await login(owner, OWNER);
    await openLaporan(owner);
    await showDay(owner, PAST_DAY);
    const before = await readDashboard(owner);

    // The cashier's device syncs one sale of two Nasi Goreng made at 12:00 WIB on that day.
    const till = await cashierContext.newPage();
    await login(till, CASHIER);
    await syncSale(till, { id: randomUUID(), createdAt: PAST_SALE_TIME, quantity: 2 });

    await openLaporan(owner);
    await showDay(owner, PAST_DAY);
    await expect(metric(owner, 'Transaksi')).toContainText(new RegExp(`^${before.count + 1}\\s*Transaksi$`));
    const after = await readDashboard(owner);

    expect(after.count).toBe(before.count + 1);
    expect(after.revenue).toBe(before.revenue + 2 * NASI_GORENG_PRICE);
    expect(after.items).toBe(before.items + 2);
    expect(after.average).toBe(Math.round(after.revenue / after.count));
    // The sale landed in the 12:00 WIB bucket, whatever the owner's device timezone is.
    expect(after.bars).toHaveLength(24);
    expect(after.bars[12]).toBe((before.bars[12] ?? 0) + 2 * NASI_GORENG_PRICE);
    expect(after.bars.reduce((sum, v) => sum + v, 0)).toBe(after.revenue);
  } finally {
    await ownerContext.close();
    await cashierContext.close();
  }
});

test('a sale made at the till shows up in the owner dashboard for Hari Ini', async ({ browser, baseURL }) => {
  const options = { baseURL, viewport: { width: 360, height: 800 } };
  const ownerContext = await browser.newContext(options);
  const cashierContext = await browser.newContext(options);
  try {
    const owner = await ownerContext.newPage();
    await login(owner, OWNER);
    await openLaporan(owner);
    const before = await readDashboard(owner);

    // The cashier sells one Nasi Goreng and pays the exact amount; wait until the server has it.
    const till = await cashierContext.newPage();
    await login(till, CASHIER);
    await till.getByRole('main').getByRole('button', { name: /^Nasi Goreng/ }).click();
    await till.getByRole('link', { name: 'LIHAT PESANAN' }).click();
    await till.getByRole('link', { name: 'LANJUT BAYAR' }).click();
    await till.getByRole('main').getByRole('group', { name: 'Nominal cepat' }).getByRole('button', { name: 'UANG PAS' }).click();
    await till.getByRole('main').getByRole('button', { name: 'BAYAR' }).click();
    await expect(till.getByRole('heading', { name: 'Transaksi Berhasil', level: 1 })).toBeVisible();
    await expect(till.getByRole('main').getByText('Tersinkron')).toBeVisible();

    // Other specs may sell today at the same moment, so the dashboard has at least this sale on top,
    // and its own numbers stay consistent with each other.
    await openLaporan(owner);
    const after = await readDashboard(owner);
    expect(after.count).toBeGreaterThanOrEqual(before.count + 1);
    expect(after.revenue).toBeGreaterThanOrEqual(before.revenue + NASI_GORENG_PRICE);
    expect(after.items).toBeGreaterThanOrEqual(before.items + 1);
    expect(after.average).toBe(Math.round(after.revenue / after.count));
    expect(after.bars.reduce((sum, v) => sum + v, 0)).toBe(after.revenue);
    await expect(owner.getByRole('region', { name: 'Menu Terlaris' })).toBeVisible();
  } finally {
    await ownerContext.close();
    await cashierContext.close();
  }
});

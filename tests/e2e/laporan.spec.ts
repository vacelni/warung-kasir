import { storedAccessToken } from './support/session';
import { expect, test, type Locator, type Page } from './support/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { goTo } from './support/offline';

// Requires the local Supabase stack with the dev seed and .env.local (see docs/RUNBOOK.md).
// Read-only: it only reads reports, so it runs once per viewport. The numbers come from the
// "Report fixtures" block in supabase/seed.sql, a fixed August 2026 window with known answers
// (including a cancelled sale, sales at 23:59 / 00:00 / 00:30 WIB, and another store's sale), picked
// with the Custom range so the result does not depend on the day the suite runs. Sales made by
// checkout are covered by laporan.mutation.spec.ts.
//
//   9 Aug  e1 23:59 WIB Kerupuk x1                                Rp2.000
//   10 Aug e2 00:30 WIB Rp40.000 (Nasi Goreng x2, Es Teh x2), e3 23:30 WIB Rp25.000 (Ayam Goreng, Es Jeruk)
//   11 Aug e4 00:30 WIB Rp15.000 (Es Teh x3); e5 12:00 WIB CANCELLED Nasi Goreng x10 Rp150.000
//   13 Aug e6 11:00 WIB Rp14.000 (Mie Goreng, Kerupuk)
//   14 Aug e7 00:00 WIB Rp10.000 (Kerupuk x5)
//   store B, 10 Aug: Rp48.000 (must never appear)

// The device clock is UTC: every day below must still be an Asia/Jakarta day (TECH C.13, TEST_PLAN G.17).
test.use({ timezoneId: 'UTC' });

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

async function openLaporan(page: Page) {
  await goTo(page, 'Laporan');
  await expect(page).toHaveURL(/\/laporan$/);
  await expect(page.getByRole('heading', { name: 'Laporan', level: 1 })).toBeVisible();
}

const main = (page: Page) => page.getByRole('main');
const metric = (page: Page, name: string) => main(page).getByRole('group', { name, exact: true });
const chart = (page: Page) => page.getByTestId('sales-chart');
const bestSellers = (page: Page) => page.getByRole('region', { name: 'Menu Terlaris' });

/** The revenue of every bar, in time order. */
const barRevenues = (page: Page) =>
  chart(page).locator('rect[data-bar]').evaluateAll((bars) => bars.map((bar) => Number(bar.getAttribute('data-revenue'))));

async function chooseCustom(page: Page, fromDay: string, toDay: string) {
  await main(page).getByRole('button', { name: 'Custom', exact: true }).click();
  await main(page).getByLabel('Dari tanggal').fill(fromDay);
  await main(page).getByLabel('Sampai tanggal').fill(toDay);
}

async function expectMetrics(page: Page, values: { omzet: string; transaksi: string; item: string; rata: string }) {
  await expect(metric(page, 'Omzet')).toContainText(values.omzet);
  await expect(metric(page, 'Transaksi')).toContainText(new RegExp(`^${values.transaksi}\\s*Transaksi$`));
  await expect(metric(page, 'Item Terjual')).toContainText(new RegExp(`^${values.item}\\s*Item Terjual$`));
  await expect(metric(page, 'Rata-rata Transaksi')).toContainText(values.rata);
}

test('owner dashboard: four metrics, chart, best sellers and the filter show the real numbers', async ({ page }) => {
  await login(page, OWNER);
  await openLaporan(page);

  // Default: Hari Ini, four metrics in a 2×2 grid. Today's sales vary, so only the shape is asserted.
  await expect(main(page).getByRole('button', { name: 'Hari Ini', exact: true })).toHaveAttribute('aria-pressed', 'true');
  for (const name of ['Omzet', 'Transaksi', 'Item Terjual', 'Rata-rata Transaksi']) {
    await expect(metric(page, name)).toBeVisible();
  }
  await expect(main(page).getByRole('group')).toHaveCount(5); // the four metrics and the period filter
  const boxes = await Promise.all(
    ['Omzet', 'Transaksi', 'Item Terjual', 'Rata-rata Transaksi'].map((name) => metric(page, name).boundingBox()),
  );
  if ((page.viewportSize()?.width ?? 0) < 768) {
    expect(boxes[0]!.y).toBe(boxes[1]!.y); // row 1: Omzet | Transaksi
    expect(boxes[2]!.y).toBe(boxes[3]!.y); // row 2: Item Terjual | Rata-rata
    expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y);
    expect(boxes[0]!.x).toBe(boxes[2]!.x);
  } else {
    // From the tablet width up the four metrics sit in one row (md:grid-cols-4).
    expect(new Set(boxes.map((box) => box!.y)).size).toBe(1);
  }
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  for (const name of ['Hari Ini', '7 Hari', '30 Hari', 'Custom']) {
    await expectTouchTarget(main(page).getByRole('button', { name, exact: true }));
  }

  // 10-11 Aug: three sales, the cancelled Rp150.000 sale and the other store ignored, 80000 / 3 → 26.667.
  await chooseCustom(page, '2026-08-10', '2026-08-11');
  await expectMetrics(page, { omzet: 'Rp80.000', transaksi: '3', item: '9', rata: 'Rp26.667' });
  await expect(main(page).getByText('10/08/2026 – 11/08/2026')).toBeVisible();

  // Two daily bars: 10 Aug (Rp40.000 + Rp25.000) and 11 Aug (Rp15.000).
  await expect(chart(page)).toBeVisible();
  expect(await barRevenues(page)).toEqual([65000, 15000]);
  const svg = await chart(page).boundingBox();
  expect(svg!.width).toBeLessThanOrEqual(page.viewportSize()!.width);

  // Best sellers: Es Teh 2+3, Nasi Goreng 2 (not 12: the cancelled sale), then single units by revenue.
  const items = bestSellers(page).getByRole('listitem');
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toContainText(/^1\s*Es Teh\s*Rp25\.000\s*5/);
  await expect(items.nth(1)).toContainText(/^2\s*Nasi Goreng\s*Rp30\.000\s*2/);
  await expect(items.nth(2)).toContainText(/^3\s*Ayam Goreng\s*Rp18\.000\s*1/);
  await expect(items.nth(3)).toContainText(/^4\s*Es Jeruk\s*Rp7\.000\s*1/);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // 10-13 Aug: 12 Aug has no sales (a zero bar), the 14 Aug 00:00 WIB sale is out, 94000 / 4 = 23.500.
  await main(page).getByLabel('Sampai tanggal').fill('2026-08-13');
  await expectMetrics(page, { omzet: 'Rp94.000', transaksi: '4', item: '11', rata: 'Rp23.500' });
  expect(await barRevenues(page)).toEqual([65000, 15000, 0, 14000]);
  await expect(bestSellers(page).getByRole('listitem')).toHaveCount(5);
  await expect(bestSellers(page).getByRole('listitem').nth(3)).toContainText(/^4\s*Mie Goreng\s*Rp12\.000\s*1/);

  // Jakarta day edges with a UTC device: 00:30 WIB and 23:30 WIB are both 10 Aug; 23:59 WIB is 9 Aug;
  // 00:00:00 WIB is the first moment of 14 Aug.
  await main(page).getByLabel('Dari tanggal').fill('2026-08-10');
  await main(page).getByLabel('Sampai tanggal').fill('2026-08-10');
  await expectMetrics(page, { omzet: 'Rp65.000', transaksi: '2', item: '6', rata: 'Rp32.500' });
  const hours = await barRevenues(page);
  expect(hours).toHaveLength(24); // one day is shown by hour
  expect(hours[0]).toBe(40000); // 00:30 WIB
  expect(hours[23]).toBe(25000); // 23:30 WIB
  expect(hours.filter((revenue) => revenue > 0)).toHaveLength(2);

  await main(page).getByLabel('Dari tanggal').fill('2026-08-09');
  await main(page).getByLabel('Sampai tanggal').fill('2026-08-09');
  await expectMetrics(page, { omzet: 'Rp2.000', transaksi: '1', item: '1', rata: 'Rp2.000' });

  await main(page).getByLabel('Dari tanggal').fill('2026-08-14');
  await main(page).getByLabel('Sampai tanggal').fill('2026-08-14');
  await expectMetrics(page, { omzet: 'Rp10.000', transaksi: '1', item: '5', rata: 'Rp10.000' });
  expect(await barRevenues(page)).toHaveLength(24);

  // A period with no sales: zeros, an empty chart message and an empty best-seller list, no crash.
  await main(page).getByLabel('Dari tanggal').fill('2026-07-01');
  await main(page).getByLabel('Sampai tanggal').fill('2026-07-02');
  await expectMetrics(page, { omzet: 'Rp0', transaksi: '0', item: '0', rata: 'Rp0' });
  await expect(main(page).getByText('Belum ada penjualan pada rentang tanggal ini.')).toBeVisible();
  await expect(chart(page)).toHaveCount(0);
  await expect(main(page).getByText('Belum ada menu terjual')).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // A reversed range is explained and nothing misleading is shown.
  await main(page).getByLabel('Dari tanggal').fill('2026-08-12');
  await main(page).getByLabel('Sampai tanggal').fill('2026-08-10');
  await expect(main(page).getByRole('alert')).toContainText('Tanggal awal tidak boleh setelah tanggal akhir');
  await expect(metric(page, 'Omzet')).toHaveCount(0);

  // Back to a preset: the Custom fields go away and the numbers come back.
  await main(page).getByRole('button', { name: '30 Hari', exact: true }).click();
  await expect(main(page).getByLabel('Dari tanggal')).toHaveCount(0);
  await expect(metric(page, 'Omzet')).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('desktop: the dashboard stays readable beside the sidebar', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== '360x800', 'One desktop run is enough; the phone projects cover the viewports.');
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, OWNER);
  await page.getByRole('navigation', { name: 'Navigasi samping' }).getByRole('link', { name: 'Laporan' }).click();
  await expect(page.getByRole('heading', { name: 'Laporan', level: 1 })).toBeVisible();

  await chooseCustom(page, '2026-08-10', '2026-08-13');
  await expectMetrics(page, { omzet: 'Rp94.000', transaksi: '4', item: '11', rata: 'Rp23.500' });
  await expect(chart(page)).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // Four metrics in one row on a wide screen.
  const ys = await Promise.all(
    ['Omzet', 'Transaksi', 'Item Terjual', 'Rata-rata Transaksi'].map(async (name) => (await metric(page, name).boundingBox())!.y),
  );
  expect(new Set(ys).size).toBe(1);
});

/** Supabase URL and publishable key for the direct requests below, read the way the app reads them. */
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

test('cashier: the dashboard is denied in the app and the report functions are denied by the database', async ({ page }) => {
  await login(page, CASHIER);

  // No Laporan tab; opening the route shows "Akses ditolak" and no report data (AC-07).
  await expect(page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('link', { name: 'Laporan' })).toHaveCount(0);
  await page.goto('/laporan');
  await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Omzet' })).toHaveCount(0);
  await expect(page.getByTestId('sales-chart')).toHaveCount(0);

  // Hiding the page is only UX: the same functions called straight against the API with the
  // cashier's own session are refused (AC-08, AC-14).
  const token = await storedAccessToken(page);
  expect(token, 'the cashier has a stored session').not.toBeNull();

  const { url, key } = supabaseEnv();
  const headers = { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const window = { p_from: '2026-08-09T17:00:00Z', p_to: '2026-08-11T17:00:00Z' };
  const calls: Array<[string, Record<string, unknown>]> = [
    ['sales_summary', window],
    ['sales_series', { ...window, p_bucket: 'day' }],
    ['top_products', { ...window, p_limit: 5 }],
  ];
  for (const [name, body] of calls) {
    const response = await page.request.post(`${url}/rest/v1/rpc/${name}`, { headers, data: body });
    expect(response.status(), `${name} status`).toBe(403);
    expect(await response.json(), `${name} body`).toMatchObject({ code: '42501' });
  }
});

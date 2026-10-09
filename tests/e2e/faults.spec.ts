import { injectFault, rest, TIMEOUT_WAIT_MS, type Fault } from './support/faults';
import { goTo, KASIR1, login, OWNER } from './support/offline';
import { expect, FAILED_REQUEST, test, type Page } from './support/test';

// TEST_PLAN G.14 fault injection for READS: HTTP 500 and a server that never answers (timeout).
// Each test makes one screen's request fail and proves four things:
//   1. a clear error state shows (what failed, and a COBA LAGI action), never an endless spinner;
//   2. the app does not retry in a loop by itself;
//   3. after the server recovers, COBA LAGI brings the real data back;
//   4. the app stays usable afterwards.
// Faults on writes (sales, settings, employees) are in faults.mutation.spec.ts.
//
// Requires the local Supabase stack with the dev seed. Read-only: nothing is saved. The behavior
// does not depend on the phone width, so it runs on the 360px phone and the 1280px desktop only.

test.skip(
  ({ viewport }) => viewport?.width !== 360 && viewport?.width !== 1280,
  'fault behavior is checked on the 360px phone and the 1280px desktop only',
);

/** Chromium also logs the failed request itself, and the app logs what it could not load. */
const EXPECTED_ERRORS = [FAILED_REQUEST, /Could not load|Could not read|Export of|Backup failed|failed unexpectedly/];

test.beforeEach(({ allowConsoleError }) => allowConsoleError(...EXPECTED_ERRORS));

const SEED_SALE = '3f9a2c4e-7b1d-4c2a-9e10-000000000001';

/** After the error state is on screen, no further request may follow on its own (no retry loop). */
async function expectNoRetryStorm(fault: Fault) {
  const seen = fault.requests.length;
  expect(seen).toBeGreaterThan(0);
  // A negative assertion has nothing to wait for: leave time for a loop to show itself.
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  expect(fault.requests.length).toBe(seen);
}

const alert = (page: Page, title: string) => page.getByRole('alert').filter({ hasText: title });
const retryButton = (page: Page) => page.getByRole('button', { name: 'COBA LAGI' });

type Scenario = {
  name: string;
  email: string;
  /** Opens the screen (client-side where the fault would otherwise break the sign-in itself). */
  open: (page: Page) => Promise<void>;
  /** The requests that fail. */
  url: RegExp;
  error: string;
  /** What shows once the data is back. */
  recovered: (page: Page) => Promise<void>;
};

const main = (page: Page) => page.getByRole('main');
/** Where the signed-in name shows: the top bar on a phone, the sidebar on a desktop. */
const identity = (page: Page) => page.getByRole('banner').or(page.getByRole('complementary'));

async function viaMenu(page: Page, label: string, path: RegExp) {
  await goTo(page, label);
  await expect(page).toHaveURL(path);
}

const scenarios: Scenario[] = [
  {
    name: 'Kasir menu',
    email: KASIR1.email,
    open: async () => {}, // login lands on /kasir, which loads the menu
    url: rest('products'),
    error: 'Menu gagal dimuat',
    recovered: (page) => expect(main(page).getByRole('button', { name: /^Nasi Goreng/ })).toBeVisible(),
  },
  {
    name: 'Riwayat',
    email: KASIR1.email,
    open: (page) => viaMenu(page, 'Riwayat', /\/riwayat$/),
    url: rest('transactions'),
    error: 'Riwayat gagal dimuat',
    recovered: async (page) => {
      // The seeded sale is from 7 Oct, so show every date.
      await page.getByRole('combobox', { name: 'Filter tanggal' }).selectOption('all');
      await page.getByRole('searchbox', { name: 'Cari kode transaksi' }).fill('3f9a2c');
      await expect(main(page).getByRole('link', { name: /TRX-20261007-3F9A2C/ })).toBeVisible();
    },
  },
  {
    name: 'Detail transaksi',
    email: KASIR1.email,
    open: async (page) => {
      await page.goto(`/riwayat/detail?id=${SEED_SALE}`);
    },
    url: rest('transactions'),
    error: 'Transaksi gagal dimuat',
    recovered: (page) => expect(main(page).getByText('TRX-20261007-3F9A2C')).toBeVisible(),
  },
  {
    name: 'Laporan',
    email: OWNER.email,
    open: (page) => viaMenu(page, 'Laporan', /\/laporan$/),
    url: rest('rpc/sales_summary'),
    error: 'Laporan gagal dimuat',
    recovered: async (page) => {
      await expect(main(page).getByRole('group', { name: 'Omzet', exact: true })).toBeVisible();
      await expect(main(page)).not.toContainText(/NaN|Infinity|undefined/);
    },
  },
  {
    name: 'Menu (owner)',
    email: OWNER.email,
    open: (page) => viaMenu(page, 'Menu', /\/menu$/),
    url: rest('products'),
    error: 'Menu gagal dimuat',
    recovered: (page) => expect(main(page).getByRole('listitem').filter({ hasText: 'Nasi Goreng' })).toBeVisible(),
  },
  {
    name: 'Kategori',
    email: OWNER.email,
    open: (page) => viaMenu(page, 'Kategori', /\/kategori$/),
    url: rest('categories'),
    error: 'Kategori gagal dimuat',
    recovered: (page) => expect(main(page).getByRole('listitem').filter({ hasText: 'Minuman' })).toBeVisible(),
  },
  {
    name: 'Karyawan',
    email: OWNER.email,
    open: (page) => viaMenu(page, 'Karyawan', /\/karyawan$/),
    // Only the cashier list; the app's own profile read (sign-in check) must keep working.
    url: /\/rest\/v1\/profiles\?[^#]*role=eq\.cashier/,
    error: 'Karyawan gagal dimuat',
    recovered: (page) => expect(main(page).getByRole('listitem').filter({ hasText: 'Andi' })).toBeVisible(),
  },
  {
    name: 'Pengaturan',
    email: OWNER.email,
    open: (page) => viaMenu(page, 'Pengaturan', /\/pengaturan$/),
    url: rest('stores'),
    error: 'Pengaturan gagal dimuat',
    recovered: (page) => expect(main(page).getByText('Warung Makan Bu Sari')).toBeVisible(),
  },
];

for (const scenario of scenarios) {
  test(`HTTP 500: ${scenario.name} shows an error, does not loop, and recovers on COBA LAGI`, async ({ page }) => {
    const fault = await injectFault(page, scenario.url, 'http500');
    await login(page, scenario.email);
    await scenario.open(page);

    await expect(alert(page, scenario.error)).toBeVisible();
    await expect(retryButton(page)).toBeEnabled();
    await expectNoRetryStorm(fault);

    // COBA LAGI while the server is still failing: same error, one more request, still usable.
    const before = fault.requests.length;
    await retryButton(page).click();
    await expect.poll(() => fault.requests.length).toBeGreaterThan(before);
    await expect(alert(page, scenario.error)).toBeVisible();

    // The server recovers.
    await fault.clear();
    await retryButton(page).click();
    await expect(main(page).getByRole('alert')).toHaveCount(0);
    await scenario.recovered(page);
  });

  test(`timeout: ${scenario.name} stops waiting, says so, and recovers on COBA LAGI`, async ({ page }) => {
    test.setTimeout(120_000);
    const fault = await injectFault(page, scenario.url, 'hang');
    await login(page, scenario.email);
    await scenario.open(page);

    // The request is never answered: the screen waits, then gives up with the same error state.
    await expect(alert(page, scenario.error)).toBeVisible({ timeout: TIMEOUT_WAIT_MS });
    await expect(retryButton(page)).toBeEnabled();
    await expectNoRetryStorm(fault);

    await fault.clear();
    await retryButton(page).click();
    await scenario.recovered(page);
  });
}

test('HTTP 500 on the menu does not stop a sale: after recovery the cashier completes the golden path', async ({ page }) => {
  const fault = await injectFault(page, rest('products'), 'http500');
  await login(page, KASIR1.email);
  await expect(alert(page, 'Menu gagal dimuat')).toBeVisible();

  await fault.clear();
  await retryButton(page).click();
  await main(page).getByRole('button', { name: /^Nasi Goreng/ }).click();
  await page.getByRole('link', { name: 'LIHAT PESANAN' }).click();
  await page.getByRole('link', { name: 'LANJUT BAYAR' }).click();
  await main(page).getByRole('group', { name: 'Nominal cepat' }).getByRole('button', { name: 'UANG PAS' }).click();
  await expect(main(page)).toContainText('Rp15.000');
  // Not paying: this spec is read-only. The payment screen being reachable and correct is the point.
  await expect(main(page).getByRole('button', { name: 'BAYAR' })).toBeEnabled();
});

test.describe('Backup / Export', () => {
  const openBackup = async (page: Page) => {
    await login(page, OWNER.email);
    await viaMenu(page, 'Backup / Export', /\/backup$/);
  };
  const exportMenu = (page: Page) => main(page).getByRole('button', { name: 'UNDUH CSV Export Menu' });

  test('HTTP 500: the export fails clearly, is not stuck, and works once the server recovers', async ({ page }) => {
    await openBackup(page);
    const fault = await injectFault(page, rest('products'), 'http500');

    await exportMenu(page).click();
    await expect(alert(page, 'Export gagal')).toBeVisible();
    await expect(exportMenu(page)).toBeEnabled();
    await expectNoRetryStorm(fault);

    await fault.clear();
    const download = page.waitForEvent('download');
    await exportMenu(page).click();
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);
    await expect(alert(page, 'Export gagal')).toHaveCount(0);
  });

  test('timeout: the export stops waiting and the buttons come back', async ({ page }) => {
    test.setTimeout(120_000);
    await openBackup(page);
    await injectFault(page, rest('products'), 'hang');

    await exportMenu(page).click();
    // While waiting, the buttons are disabled so the same export cannot be started twice.
    await expect(main(page).getByRole('button', { name: 'MENYIAPKAN… Export Menu' })).toBeDisabled();
    await expect(alert(page, 'Export gagal')).toBeVisible({ timeout: TIMEOUT_WAIT_MS });
    await expect(exportMenu(page)).toBeEnabled();
  });
});

test.describe('sign-in and app start under a stalled server', () => {
  // No answer at all (a timeout) says a connection is needed; a server that answered with 500 must not.
  const noAnswer = (page: Page) => page.getByText('Koneksi internet diperlukan untuk masuk.');
  const serverProblem = (page: Page) => page.getByText('Server sedang bermasalah. Coba lagi sebentar lagi.');

  test('timeout: a sign-in the server never answers ends with an error and can be retried', async ({ page }) => {
    test.setTimeout(120_000);
    const fault = await injectFault(page, /\/auth\/v1\/token\?grant_type=password/, 'hang');
    await page.goto('/login');
    await page.getByLabel('Email').fill(KASIR1.email);
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByRole('button', { name: 'MASUK' }).click();

    await expect(page.getByRole('button', { name: 'MEMPROSES…' })).toBeDisabled();
    await expect(noAnswer(page)).toBeVisible({ timeout: TIMEOUT_WAIT_MS });
    await expect(serverProblem(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'MASUK' })).toBeEnabled();
    await expect(page).toHaveURL(/\/login$/);
    expect(fault.requests).toHaveLength(1);

    await fault.clear();
    await page.getByRole('button', { name: 'MASUK' }).click();
    await expect(page).toHaveURL(/\/kasir$/, { timeout: 15_000 });
  });

  test('HTTP 500 on the sign-in shows an error and can be retried', async ({ page }) => {
    const fault = await injectFault(page, /\/auth\/v1\/token\?grant_type=password/, 'http500');
    await page.goto('/login');
    await page.getByLabel('Email').fill(KASIR1.email);
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByRole('button', { name: 'MASUK' }).click();

    await expect(serverProblem(page)).toBeVisible();
    await expect(noAnswer(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'MASUK' })).toBeEnabled();
    expect(fault.requests).toHaveLength(1);

    await fault.clear();
    await page.getByRole('button', { name: 'MASUK' }).click();
    await expect(page).toHaveURL(/\/kasir$/, { timeout: 15_000 });
  });

  test('timeout: when the profile check stalls, a signed-in device opens with its saved identity', async ({ page }) => {
    await login(page, KASIR1.email);
    await expect(identity(page)).toContainText(KASIR1.name);
    // Wait for the identity to be written to the device before cutting the server off.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const open = indexedDB.open('warung-kasir');
              open.onsuccess = () => {
                const db = open.result;
                if (!db.objectStoreNames.contains('identity')) return resolve(0);
                const count = db.transaction('identity').objectStore('identity').count();
                count.onsuccess = () => resolve(count.result);
              };
            }),
        ),
      )
      .toBeGreaterThan(0);

    await injectFault(page, /\/rest\/v1\/profiles\?[^#]*id=eq\./, 'hang');
    await page.reload();

    // The app does not wait for the stalled server: it opens with the saved name after a few seconds.
    await expect(identity(page)).toContainText(KASIR1.name, { timeout: 15_000 });
    await expect(main(page).getByRole('button', { name: /^Nasi Goreng/ })).toBeVisible();
  });
});

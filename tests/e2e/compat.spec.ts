import { removeNewerBrowserFeatures } from './support/browser-features';
import { goTo, KASIR1, login, syncStatus } from './support/offline';
import { expect, test, type Page } from './support/test';

// TEST_PLAN G.13 browser capabilities. The app uses a few newer browser features (Web Locks,
// BroadcastChannel, persistent storage, service workers, IndexedDB). A browser that lacks one, or a
// profile that blocks it (private mode, managed devices), must still open the app and take orders;
// the sale itself is covered by compat.mutation.spec.ts.
//
// Read-only. Runs on the 360px phone and the 1280px desktop only.

test.skip(
  ({ viewport }) => viewport?.width !== 360 && viewport?.width !== 1280,
  'capability fallbacks are checked on the 360px phone and the 1280px desktop only',
);

const main = (page: Page) => page.getByRole('main');

test('without Web Locks, BroadcastChannel, persistent storage and service workers: sign in, order, and reach payment', async ({ page }) => {
  await removeNewerBrowserFeatures(page);
  const missing = await (async () => {
    await page.goto('/login');
    return page.evaluate(() => ({
      locks: navigator.locks === undefined,
      broadcast: typeof BroadcastChannel === 'undefined',
      storage: navigator.storage === undefined,
      serviceWorker: !('serviceWorker' in navigator),
    }));
  })();
  expect(missing).toEqual({ locks: true, broadcast: true, storage: true, serviceWorker: true });

  await login(page, KASIR1.email);
  await main(page).getByRole('button', { name: /^Nasi Goreng/ }).click();
  await main(page).getByRole('button', { name: /^Es Teh/ }).click();
  await page.getByRole('link', { name: 'LIHAT PESANAN' }).click();
  await page.getByRole('link', { name: 'LANJUT BAYAR' }).click();
  await main(page).getByRole('group', { name: 'Nominal cepat' }).getByRole('button', { name: 'UANG PAS' }).click();
  await expect(main(page).getByLabel('Uang diterima')).toHaveValue(/20\.?000/);
  await expect(main(page).getByRole('button', { name: 'BAYAR' })).toBeEnabled();

  // The sync panel still works: nothing to send, nothing broken.
  await goTo(page, 'Lainnya');
  await expect(syncStatus(page).getByRole('status')).toHaveText('Semua tersinkron');
});

test.describe('IndexedDB blocked by the browser', () => {
  test.beforeEach(async ({ page, allowConsoleError }) => {
    // The app reports what it cannot store; those reports are the expected behavior here.
    allowConsoleError(/Could not|device|menu saved/i);
    await page.addInitScript(() => {
      IDBFactory.prototype.open = () => {
        throw new DOMException('Storage is blocked.', 'SecurityError');
      };
    });
  });

  test('signing in and ordering still work, and BAYAR says the sale could not be saved instead of pretending', async ({ page }) => {
    await login(page, KASIR1.email);
    await main(page).getByRole('button', { name: /^Nasi Goreng/ }).click();
    await page.getByRole('link', { name: 'LIHAT PESANAN' }).click();
    await page.getByRole('link', { name: 'LANJUT BAYAR' }).click();
    await main(page).getByRole('group', { name: 'Nominal cepat' }).getByRole('button', { name: 'UANG PAS' }).click();
    await main(page).getByRole('button', { name: 'BAYAR' }).click();

    // Never "Transaksi Berhasil" for a sale that was not kept; the order stays and can be retried.
    await expect(main(page).getByText('Gagal menyimpan transaksi di perangkat ini.')).toBeVisible();
    await expect(page).toHaveURL(/\/kasir\/bayar$/);
    await expect(main(page).getByRole('button', { name: 'BAYAR' })).toBeEnabled();
    await expect(main(page)).toContainText('Rp15.000');
  });
});

import { chromium, expect, FAILED_REQUEST, test, type Browser, type Page } from './support/test';
import {
  editStoredSession,
  EXPIRED_AT,
  KASIR1,
  KASIR2,
  login,
  openLainnya,
  OWNER,
  outboxEntries,
  outboxEntry,
  productCard,
  putOutboxEntry,
  recordRpcCalls,
  RPC,
  sell,
  serverTransactions,
  startOnline,
  STORE_B_PRODUCT,
  syncStatus,
} from './support/offline';
import { storedAuthKeys } from './support/session';

// These specs switch the network off and on on purpose. The failed requests and the app's own
// reports of what it could not reach are expected; uncaught exceptions still fail every test.
test.beforeEach(({ allowConsoleError }) =>
  allowConsoleError(FAILED_REQUEST, /Could not|Sync pass|Service worker registration failed|Export of|failed unexpectedly/),
);

// Offline sales and synchronization (TEST_PLAN G.9 offline cases, G.10, G.11; AC-10, AC-11, AC-12)
// against the production build with its service worker. Saves real sales; reset the local
// database afterwards with `npx supabase db reset`.

test.describe.configure({ mode: 'serial' });

const PENDING_BADGE = 'Tersimpan • Menunggu sinkronisasi';
/** The `next dev` server of the other projects (an origin in the local ALLOWED_ORIGINS). */
const DEV_SERVER = 'http://localhost:3100';

test('G.10: offline sale survives reload and a browser restart, then syncs once with its sale time', async ({ baseURL, channel, viewport, watchContext, allowConsoleError }, testInfo) => {
  allowConsoleError(FAILED_REQUEST); // requests that fail on purpose while the device is offline
  const profileDir = testInfo.outputPath('profile');
  // The same browser (Chromium or the Edge channel) and viewport as the project.
  const options = { baseURL, channel, viewport: viewport ?? { width: 360, height: 800 }, serviceWorkers: 'allow' as const };

  // 1–2. Login while online; the menu is loaded (and saved on the device).
  let context = await chromium.launchPersistentContext(profileDir, options);
  watchContext(context);
  let page = context.pages()[0] ?? (await context.newPage());
  await startOnline(page, KASIR1.email);

  // 3–5. Disconnect; the cashier screen still opens; a sale is saved on the device.
  await context.setOffline(true);
  await page.reload();
  await expect(productCard(page, 'Nasi Goreng')).toBeVisible();
  const id = await sell(page, ['Nasi Goreng', 'Es Teh']);
  await expect(page.getByText(PENDING_BADGE)).toBeVisible();
  const saved = await outboxEntry(page, id);
  expect(saved).toMatchObject({ cashier_id: KASIR1.id, sync_status: 'pending', total: 20000 });

  // Reload while offline: still there, and in Riwayat with its badge.
  await page.reload();
  await page.goto('/riwayat');
  await expect(page.getByRole('main').getByText(saved!.code)).toBeVisible();
  await expect(page.getByRole('main').getByText('Belum tersinkron')).toBeVisible();

  // 6–8. Close the browser; reopen the same profile, still offline: the sale is still pending.
  await context.close();
  context = await chromium.launchPersistentContext(profileDir, { ...options, offline: true });
  watchContext(context);
  page = context.pages()[0] ?? (await context.newPage());
  await page.goto('/riwayat');
  await expect(page.getByRole('banner')).toContainText(KASIR1.name);
  await expect(page.getByRole('main').getByText(saved!.code)).toBeVisible();
  expect(await outboxEntry(page, id)).toMatchObject({ sync_status: 'pending', created_at: saved!.created_at });

  // 9–10. Restore the network: the online event syncs it, no tap needed.
  const rpcCalls = recordRpcCalls(context);
  await context.setOffline(false);
  await expect.poll(async () => (await outboxEntry(page, id))?.sync_status, { timeout: 20_000 }).toBe('synced');
  await expect(page.getByRole('main').getByText('Belum tersinkron')).toHaveCount(0);
  expect(rpcCalls.filter((callId) => callId === id)).toHaveLength(1);

  // 11. In the database exactly once; created_at = sale time, synced_at set by the server.
  const rows = await serverTransactions(context, id);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ cashier_id: KASIR1.id, code: saved!.code, total: 20000 });
  expect(Date.parse(rows[0]!.created_at)).toBe(Date.parse(saved!.created_at));
  expect(Date.parse(rows[0]!.synced_at)).toBeGreaterThan(Date.parse(saved!.created_at));
  await context.close();
});

test('G.11: interrupted sync is retried automatically (backoff), same UUID, exactly one transaction', async ({ page, context }) => {
  await startOnline(page, KASIR1.email);
  const rpcCalls = recordRpcCalls(context);

  // First attempt: the server commits, but the response never arrives. Every later call passes.
  let interrupted = false;
  await page.route(`**${RPC}`, async (route) => {
    if (!interrupted) {
      interrupted = true;
      await route.fetch();
      await route.abort('connectionreset');
      return;
    }
    await route.continue();
  });

  const id = await sell(page, ['Es Jeruk']);
  await expect(page.getByText(PENDING_BADGE)).toBeVisible();
  await expect(page.getByRole('banner').getByText('1 belum tersinkron')).toBeVisible();

  // No tap: the backoff timer (10 s) retries; the server answers 'exists'.
  await expect.poll(async () => (await outboxEntry(page, id))?.sync_status, { timeout: 25_000 }).toBe('synced');
  expect(rpcCalls.filter((callId) => callId === id)).toHaveLength(2);
  expect(await serverTransactions(context, id)).toHaveLength(1);
  await expect(page.getByRole('banner').getByText(/belum tersinkron/)).toHaveCount(0);
});

test('permanent rejection: failed, kept on the device with its reason, never retried by itself', async ({ page, context }) => {
  await startOnline(page, KASIR1.email);
  await context.setOffline(true);
  const id = await sell(page, ['Kerupuk']);

  // Stage a sale the server must reject: a product of another store (WK001).
  const entry = (await outboxEntry(page, id))!;
  await putOutboxEntry(page, { ...entry, items: entry.items.map((item) => ({ ...item, product_id: STORE_B_PRODUCT })) });

  const rpcCalls = recordRpcCalls(context);
  await context.setOffline(false);
  await expect.poll(async () => (await outboxEntry(page, id))?.sync_status, { timeout: 20_000 }).toBe('failed');
  expect((await outboxEntry(page, id))?.last_error).toMatch(/^WK001: /);
  expect(await serverTransactions(context, id)).toHaveLength(0);

  // Visible with its reason and a retry, in Lainnya and in the history.
  await openLainnya(page);
  await expect(syncStatus(page)).toContainText('1 gagal sinkron');
  await expect(syncStatus(page)).toContainText('tidak dihapus');
  await expect(syncStatus(page).getByRole('button', { name: 'COBA LAGI' })).toBeVisible();
  await page.goto(`/kasir/selesai?id=${id}`);
  await expect(page.getByText('Server menolak data transaksi ini (data tidak valid untuk warung ini).', { exact: false })).toBeVisible();

  // No automatic retries for a permanent failure (wait past the first backoff step).
  await page.waitForTimeout(12_000);
  expect(rpcCalls.filter((callId) => callId === id)).toHaveLength(1);
  expect(await outboxEntry(page, id)).toMatchObject({ sync_status: 'failed' });
});

test('different user on the same device: logout warning, nothing deleted, never synced by someone else', async ({ page, context }) => {
  await startOnline(page, KASIR1.email);
  await context.setOffline(true);
  const id = await sell(page, ['Mie Goreng']);

  // Logout with a pending sale: blocking warning with the count (A.24).
  await openLainnya(page);
  await page.getByRole('main').getByRole('button', { name: 'Keluar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Masih ada 1 transaksi belum tersinkron.' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'SINKRONKAN SEKARANG' })).toHaveCount(0); // offline

  // Batal: still inside, sale still there.
  await dialog.getByRole('button', { name: 'BATAL' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/lainnya$/);
  expect(await outboxEntry(page, id)).toMatchObject({ sync_status: 'pending' });

  // Tetap keluar: signed out, sale kept on the device for Andi.
  await page.getByRole('main').getByRole('button', { name: 'Keluar' }).click();
  await dialog.getByRole('button', { name: 'Tetap keluar' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await outboxEntry(page, id)).toMatchObject({ cashier_id: KASIR1.id, sync_status: 'pending' });

  // Back online, Budi logs in on the same device: Andi's sale is not his to send.
  await context.setOffline(false);
  const rpcCalls = recordRpcCalls(context);
  await login(page, KASIR2.email);
  await openLainnya(page);
  await expect(syncStatus(page)).toContainText('Semua tersinkron');
  await page.waitForTimeout(2_000);
  expect(rpcCalls).not.toContain(id);
  expect(await outboxEntry(page, id)).toMatchObject({ cashier_id: KASIR1.id, sync_status: 'pending', attempts: 0 });

  // Budi has nothing pending: logout is immediate. Andi logs back in: his sale syncs, as Andi.
  await page.getByRole('main').getByRole('button', { name: 'Keluar' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, KASIR1.email);
  await expect.poll(async () => (await outboxEntry(page, id))?.sync_status, { timeout: 20_000 }).toBe('synced');
  const rows = await serverTransactions(context, id);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.cashier_id).toBe(KASIR1.id);
});

test('logout warning: Sinkronkan sekarang sends the pending sale, then logs out', async ({ page, context }) => {
  await startOnline(page, KASIR1.email);
  await context.setOffline(true);
  const id = await sell(page, ['Es Teh']);
  await openLainnya(page);
  await context.setOffline(false);
  // Keep the sale pending until the user asks: hold the automatic sync off for this one call.
  await page.route(`**${RPC}`, (route) => route.abort('internetdisconnected'), { times: 1 });

  await page.getByRole('main').getByRole('button', { name: 'Keluar' }).click();
  const dialog = page.getByRole('dialog', { name: /Masih ada 1 transaksi belum tersinkron\./ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'SINKRONKAN SEKARANG' }).click();

  await expect(page).toHaveURL(/\/login$/);
  expect(await outboxEntry(page, id)).toMatchObject({ sync_status: 'synced' });
  expect(await serverTransactions(context, id)).toHaveLength(1);
});

test('two tabs: one sync at a time, each sale sent exactly once', async ({ context }) => {
  const tabA = await context.newPage();
  await startOnline(tabA, KASIR1.email);
  const tabB = await context.newPage();
  await tabB.goto('/kasir');
  await expect(productCard(tabB, 'Nasi Goreng')).toBeVisible();

  await context.setOffline(true);
  const fromA = await sell(tabA, ['Nasi Goreng']);
  const fromB = await sell(tabB, ['Ayam Goreng']);

  // Both tabs get the online event (and the visibility event) and both try to sync.
  const rpcCalls = recordRpcCalls(context);
  await context.setOffline(false);
  await tabA.bringToFront();
  await tabB.bringToFront();

  await expect.poll(async () => (await outboxEntries(tabA)).filter((e) => [fromA, fromB].includes(e.id) && e.sync_status === 'synced').length, {
    timeout: 20_000,
  }).toBe(2);
  expect(rpcCalls.filter((callId) => callId === fromA)).toHaveLength(1);
  expect(rpcCalls.filter((callId) => callId === fromB)).toHaveLength(1);
  expect(await serverTransactions(context, fromA)).toHaveLength(1);
  expect(await serverTransactions(context, fromB)).toHaveLength(1);
  // Both tabs show the same state (the second learns it from the first).
  for (const tab of [tabA, tabB]) {
    await openLainnya(tab);
    await expect(syncStatus(tab)).toContainText('Semua tersinkron');
  }
});

test('G.9 offline session: token expires offline → stays in the app and sells; reconnect → refresh works and syncs', async ({ page, context }) => {
  await startOnline(page, KASIR1.email);
  await context.setOffline(true);
  // The access token has expired and cannot be refreshed: the device is offline.
  await editStoredSession(page, { expires_at: EXPIRED_AT });
  await page.reload();

  await expect(page).toHaveURL(/\/kasir$/);
  await expect(page.getByRole('banner')).toContainText(KASIR1.name);
  // Not the blocking "cannot check your account" screen.
  await expect(page.getByText('Tidak dapat terhubung ke server', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'COBA LAGI' })).toHaveCount(0);
  const id = await sell(page, ['Nasi Goreng']);
  await expect(page.getByText(PENDING_BADGE)).toBeVisible();

  await context.setOffline(false);
  await expect.poll(async () => (await outboxEntry(page, id))?.sync_status, { timeout: 30_000 }).toBe('synced');
  await expect(page).not.toHaveURL(/\/login/);
  expect(await serverTransactions(context, id)).toHaveLength(1);
});

test('G.9 server rejects the session on reconnect → login; the pending sale stays and syncs after login', async ({ page, context }) => {
  await startOnline(page, KASIR1.email);
  await context.setOffline(true);
  const id = await sell(page, ['Es Jeruk']);
  // Expired access token and a refresh token the server no longer accepts.
  await editStoredSession(page, { expires_at: EXPIRED_AT, refresh_token: 'revoked-refresh-token' });
  const rpcCalls = recordRpcCalls(context);

  await context.setOffline(false);
  await page.reload();

  // The rejection may land before the reload (the online event already tried to sync) or during
  // it; either way the session is gone and the user is on the login page (D5).
  await expect(page).toHaveURL(/\/login(\?alasan=expired)?$/);
  // Kept on the device, untouched: a sync pass checks the session before it marks or sends
  // anything (features/offline/sync.ts), so a rejected session never sends the sale (SEC-09).
  expect(await outboxEntry(page, id)).toMatchObject({ cashier_id: KASIR1.id, sync_status: 'pending', attempts: 0 });
  expect(rpcCalls).toEqual([]);

  await login(page, KASIR1.email);
  await expect.poll(async () => (await outboxEntry(page, id))?.sync_status, { timeout: 20_000 }).toBe('synced');
  expect(rpcCalls).toEqual([id]);
  expect(await serverTransactions(context, id)).toHaveLength(1);
});

/**
 * SEC-01: "Keluar" while offline after the access token expired. auth-js cannot refresh the
 * token, so it cannot sign out by itself; the app must still delete the session, or the next person
 * who opens the app once the network is back is signed in as this user.
 */
test('SEC-01: logout offline with an expired token ends the session on the device, at once', async ({ page, context }) => {
  await startOnline(page, OWNER.email);
  await context.setOffline(true);
  await editStoredSession(page, { expires_at: EXPIRED_AT });
  await page.reload();
  await expect(page.getByRole('banner')).toContainText(OWNER.name); // still in the app (D5)

  await openLainnya(page);
  const started = Date.now();
  await page.getByRole('main').getByRole('button', { name: 'Keluar' }).click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 5_000 });
  expect(Date.now() - started).toBeLessThan(5_000);
  expect(await storedAuthKeys(page)).toEqual([]);

  // Network back: the next person on this device gets the login page, not the owner's account.
  await context.setOffline(false);
  await page.goto('/kasir');
  await expect(page).toHaveURL(/\/login$/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'MASUK' })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  expect(await storedAuthKeys(page)).toEqual([]);
});

test('SEC-01: "Tetap keluar" offline with an expired token keeps the sale, which syncs only after that cashier logs in', async ({ page, context }) => {
  await startOnline(page, KASIR1.email);
  await context.setOffline(true);
  const id = await sell(page, ['Mie Goreng']);
  await editStoredSession(page, { expires_at: EXPIRED_AT });

  await openLainnya(page);
  await page.getByRole('main').getByRole('button', { name: 'Keluar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Masih ada 1 transaksi belum tersinkron.' });
  const started = Date.now();
  await dialog.getByRole('button', { name: 'Tetap keluar' }).click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 5_000 });
  expect(Date.now() - started).toBeLessThan(5_000);
  expect(await storedAuthKeys(page)).toEqual([]);
  expect(await outboxEntry(page, id)).toMatchObject({ cashier_id: KASIR1.id, sync_status: 'pending', attempts: 0 });

  const rpcCalls = recordRpcCalls(context);
  await context.setOffline(false);
  await page.goto('/kasir');
  await expect(page).toHaveURL(/\/login$/);
  await page.waitForTimeout(1_000);
  expect(rpcCalls).toEqual([]); // nobody is signed in: nothing is sent

  await login(page, KASIR1.email);
  await expect.poll(async () => (await outboxEntry(page, id))?.sync_status, { timeout: 20_000 }).toBe('synced');
  expect(rpcCalls).toEqual([id]);
  expect(await serverTransactions(context, id)).toHaveLength(1);
});

/**
 * The owner switches a cashier's account on or off in Karyawan (admin-cashier Edge Function). Done
 * on the dev server's origin: the function's CORS allows only the configured app origins.
 */
async function setCashierActive(browser: Browser, name: string, active: boolean) {
  const context = await browser.newContext({ baseURL: DEV_SERVER });
  const page: Page = await context.newPage();
  try {
    await login(page, OWNER.email);
    await page.goto('/karyawan');
    await page.getByRole('button', { name: `Aksi untuk ${name}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: active ? 'Aktifkan' : 'Nonaktifkan' }).click();
    await expect(page.getByText(`${name} ${active ? 'diaktifkan' : 'dinonaktifkan'}.`)).toBeVisible();
  } finally {
    await context.close();
  }
}

test('cashier deactivated before sync: the sale fails (WK002), stays on the device, still theirs', async ({ page, context, browser }) => {
  await startOnline(page, KASIR2.email);
  await context.setOffline(true);
  const id = await sell(page, ['Kerupuk']);

  try {
    await setCashierActive(browser, KASIR2.name, false);

    await context.setOffline(false);
    await expect.poll(async () => (await outboxEntry(page, id))?.sync_status, { timeout: 20_000 }).toBe('failed');
    const entry = await outboxEntry(page, id);
    expect(entry?.last_error).toMatch(/^WK002: /);
    expect(entry?.cashier_id).toBe(KASIR2.id);
    expect(await serverTransactions(context, id)).toHaveLength(0);
    // The success screen still open from the sale follows the result, with the reason.
    await expect(page.getByRole('main').getByText('Gagal sinkron', { exact: true })).toBeVisible();
    await expect(page.getByRole('banner')).toContainText('1 gagal sinkron');
    await expect(page.getByText(/Akun kasir ini tidak aktif di server/)).toBeVisible();

    // Reopening the app: the account check fails → login with the reason; the sale stays.
    await page.reload();
    await expect(page).toHaveURL(/\/login\?alasan=inactive$/);
    expect(await outboxEntry(page, id)).toMatchObject({ cashier_id: KASIR2.id, sync_status: 'failed' });
  } finally {
    await setCashierActive(browser, KASIR2.name, true);
  }
});

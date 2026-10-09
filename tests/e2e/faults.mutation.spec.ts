import { ADMIN_FUNCTION, CREATE_TRANSACTION, injectFault, rest, TIMEOUT_WAIT_MS } from './support/faults';
import {
  KASIR1,
  login,
  OWNER,
  outboxEntry,
  recordRpcCalls,
  sell,
  serverTransactions,
  signalOnline,
  syncStatus,
  goTo,
} from './support/offline';
import { expect, FAILED_REQUEST, test, type Page } from './support/test';

// TEST_PLAN G.14 fault injection for WRITES: HTTP 500 and stalled requests on a sale's sync, on
// saving settings, and on the employee actions. For each one the tests prove:
//   - the user's work is kept (the sale stays on the device, typed text stays in the form);
//   - the app does not hang and does not repeat the action by itself (request counts);
//   - a timeout is a temporary error for a sale (never `failed`), a refusal is a permanent one;
//   - after the server recovers, one retry completes the action exactly once.
//
// Requires the local Supabase stack (with the edge runtime) and the dev seed. Saves a real sale for
// kasir1.a and creates one cashier account; run `npx supabase db reset` afterwards. Runs in the
// serial "mutations" project, on the dev server (the admin function accepts that origin).

const EXPECTED_ERRORS = [
  FAILED_REQUEST,
  /^Could not update the store:/,
  /^admin-cashier (reset_password|set_active): (refused|request failed):/,
];

test.beforeEach(({ allowConsoleError }) => allowConsoleError(...EXPECTED_ERRORS));

const main = (page: Page) => page.getByRole('main');
const sheet = (page: Page) => page.getByRole('dialog');

/** Negative assertion: nothing else may follow on its own (no retry loop). */
async function expectQuiet(requests: string[]) {
  const seen = requests.length;
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  expect(requests.length).toBe(seen);
}

test.describe('a sale whose sync is failing (Bayar is local-first, so the sale itself is never lost)', () => {
  test('HTTP 500: the sale shows as saved, stays pending (a temporary error), and syncs once after recovery', async ({
    page,
    context,
  }) => {
    const rpcIds = recordRpcCalls(context);
    const fault = await injectFault(page, CREATE_TRANSACTION, 'http500');
    await login(page, KASIR1.email);

    const id = await sell(page, ['Nasi Goreng']);
    // The success screen does not depend on the server.
    await expect(main(page).getByText('Tersimpan • Menunggu sinkronisasi')).toBeVisible();

    await expect.poll(() => fault.requests.length).toBe(1);
    await expect.poll(async () => (await outboxEntry(page, id))?.sync_status).toBe('pending');
    const failedPass = await outboxEntry(page, id);
    expect(failedPass).toMatchObject({ id, sync_status: 'pending', attempts: 1 });
    expect(failedPass?.last_error).toContain('injected server failure');
    await expectQuiet(fault.requests); // backoff is 10 s, not an instant loop

    await goTo(page, 'Lainnya');
    await expect(syncStatus(page).getByRole('status')).toHaveText('1 belum tersinkron');

    // The server recovers and the network signal arrives: the same sale is sent, once.
    await fault.clear();
    await signalOnline(page);
    await expect.poll(async () => (await outboxEntry(page, id))?.sync_status).toBe('synced');
    await expect(syncStatus(page).getByRole('status')).toHaveText('Semua tersinkron');

    expect(new Set(rpcIds)).toEqual(new Set([id]));
    expect(rpcIds).toHaveLength(2); // the failed attempt and the successful one
    expect(await serverTransactions(context, id)).toHaveLength(1);
  });

  test('timeout: a request the server never answers leaves the sale pending (not failed), then it syncs once', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    const rpcIds = recordRpcCalls(context);
    const fault = await injectFault(page, CREATE_TRANSACTION, 'hang');
    await login(page, KASIR1.email);

    const id = await sell(page, ['Es Teh']);
    // While the request hangs the sale is on screen as saved and being sent; the cashier can go on.
    await expect(main(page).getByText('Menyinkronkan…')).toBeVisible();
    expect(await outboxEntry(page, id)).toMatchObject({ sync_status: 'syncing' });
    await main(page).getByRole('button', { name: 'TRANSAKSI BARU' }).click();
    await expect(page).toHaveURL(/\/kasir$/);
    await expect(main(page).getByRole('button', { name: /^Nasi Goreng/ })).toBeVisible();

    // After the limit, a temporary error: pending again, error recorded, one request, no loop.
    await expect.poll(async () => (await outboxEntry(page, id))?.sync_status, { timeout: TIMEOUT_WAIT_MS }).toBe('pending');
    const afterTimeout = await outboxEntry(page, id);
    expect(afterTimeout?.attempts).toBe(1);
    expect(afterTimeout?.last_error).toBeTruthy();
    expect(afterTimeout?.last_error).not.toMatch(/^(WK|22|23)/);
    expect(fault.requests).toHaveLength(1);
    await expectQuiet(fault.requests);

    await fault.clear();
    await signalOnline(page);
    await expect.poll(async () => (await outboxEntry(page, id))?.sync_status).toBe('synced');
    expect(new Set(rpcIds)).toEqual(new Set([id])); // the retry reuses the sale's own UUID
    expect(await serverTransactions(context, id)).toHaveLength(1);
  });

  test('a refusal is permanent: failed after one request, no loop, kept on the device, resent once by COBA LAGI', async ({
    page,
    context,
  }) => {
    const rpcIds = recordRpcCalls(context);
    const fault = await injectFault(page, CREATE_TRANSACTION, 'rejected');
    await login(page, KASIR1.email);

    const id = await sell(page, ['Kerupuk']);
    await expect.poll(async () => (await outboxEntry(page, id))?.sync_status).toBe('failed');
    expect(await outboxEntry(page, id)).toMatchObject({ id, attempts: 1 });
    expect((await outboxEntry(page, id))?.last_error).toMatch(/^WK001/);
    await expectQuiet(fault.requests);
    expect(fault.requests).toHaveLength(1);

    await goTo(page, 'Lainnya');
    await expect(syncStatus(page).getByRole('status')).toHaveText('1 gagal sinkron');
    await fault.clear();
    await syncStatus(page).getByRole('button', { name: 'COBA LAGI' }).click();
    await expect.poll(async () => (await outboxEntry(page, id))?.sync_status).toBe('synced');

    expect(new Set(rpcIds)).toEqual(new Set([id]));
    expect(await serverTransactions(context, id)).toHaveLength(1);
  });
});

test.describe('saving the store settings', () => {
  const openReceiptSheet = async (page: Page) => {
    await login(page, OWNER.email);
    await goTo(page, 'Pengaturan');
    await page.getByRole('button', { name: 'Ubah catatan struk' }).click();
    return sheet(page).getByLabel('Catatan struk').inputValue();
  };

  test('HTTP 500: the form keeps what was typed and says it failed; after recovery one save works', async ({ page }) => {
    const original = await openReceiptSheet(page);
    const note = `Catatan gagal ${Date.now().toString(36)}`;
    const fault = await injectFault(page, rest('stores'), 'http500', { methods: ['PATCH'] });

    await sheet(page).getByLabel('Catatan struk').fill(note);
    await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
    await expect(sheet(page).getByText('Pengaturan gagal disimpan. Coba lagi.')).toBeVisible();
    await expect(sheet(page).getByLabel('Catatan struk')).toHaveValue(note);
    await expect(sheet(page).getByRole('button', { name: 'SIMPAN' })).toBeEnabled();
    expect(fault.requests).toHaveLength(1);
    await expectQuiet(fault.requests);

    // Nothing was saved.
    await sheet(page).getByRole('button', { name: 'BATAL' }).click();
    await page.reload();
    await expect(main(page).getByText(note)).toHaveCount(0);

    // Recovery: the same edit succeeds, once; then the seed value is put back.
    await fault.clear();
    await page.getByRole('button', { name: 'Ubah catatan struk' }).click();
    await sheet(page).getByLabel('Catatan struk').fill(note);
    await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
    await expect(page.getByText('Pengaturan disimpan.')).toBeVisible();
    await page.reload();
    await expect(main(page).getByText(note)).toBeVisible();

    await page.getByRole('button', { name: 'Ubah catatan struk' }).click();
    await sheet(page).getByLabel('Catatan struk').fill(original);
    await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
    await expect(page.getByText('Pengaturan disimpan.')).toBeVisible();
  });

  test('timeout: the save is not sent twice, the form is released with an error, and the text is kept', async ({ page }) => {
    test.setTimeout(120_000);
    await openReceiptSheet(page);
    const note = `Catatan lambat ${Date.now().toString(36)}`;
    const fault = await injectFault(page, rest('stores'), 'hang', { methods: ['PATCH'] });

    await sheet(page).getByLabel('Catatan struk').fill(note);
    await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
    // Busy: the submit button is disabled, so a second tap cannot send a second request.
    await expect(sheet(page).getByRole('button', { name: 'MENYIMPAN…' })).toBeDisabled();
    await expect(sheet(page).getByRole('button', { name: 'BATAL' })).toBeDisabled();

    await expect(sheet(page).getByRole('alert')).toContainText('Tidak dapat terhubung ke server', { timeout: TIMEOUT_WAIT_MS });
    await expect(sheet(page).getByLabel('Catatan struk')).toHaveValue(note);
    await expect(sheet(page).getByRole('button', { name: 'SIMPAN' })).toBeEnabled();
    expect(fault.requests).toHaveLength(1);

    // The sheet can be closed again (it was not stuck).
    await sheet(page).getByRole('button', { name: 'BATAL' }).click();
    await expect(sheet(page)).toBeHidden();
  });
});

test.describe('employee actions through the admin-cashier Edge Function', () => {
  /** Creates a throwaway cashier (a real call) and opens the employee list. */
  async function withNewCashier(page: Page) {
    const tag = Date.now().toString(36);
    const name = `Kasir Gangguan ${tag}`;
    await login(page, OWNER.email);
    await goTo(page, 'Karyawan');
    await page.getByRole('button', { name: /TAMBAH KASIR/ }).click();
    await sheet(page).getByLabel('Nama').fill(name);
    await sheet(page).getByLabel('Email login').fill(`gangguan-${tag}@warungkasir.test`);
    await sheet(page).getByLabel('Password', { exact: true }).fill('awal-12345');
    await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
    await expect(page.getByText(`Akun kasir ${name} dibuat.`)).toBeVisible();
    return name;
  }

  const row = (page: Page, name: string) => main(page).getByRole('listitem').filter({ hasText: name });
  const openActions = async (page: Page, name: string, action: string) => {
    await page.getByRole('button', { name: `Aksi untuk ${name}` }).click();
    await sheet(page).getByRole('button', { name: action }).click();
  };

  test('HTTP 500: reset password and deactivate fail once each, change nothing, and work after recovery', async ({ page }) => {
    const name = await withNewCashier(page);
    const fault = await injectFault(page, ADMIN_FUNCTION, 'http500', { methods: ['POST'] });

    // Reset password: error in the sheet, one request, the typed password is still there.
    await openActions(page, name, 'Reset Password');
    await sheet(page).getByLabel('Password baru').fill('baru-12345');
    await sheet(page).getByRole('button', { name: 'RESET PASSWORD' }).click();
    await expect(sheet(page).getByText('Password gagal direset. Coba lagi.')).toBeVisible();
    await expect(sheet(page).getByLabel('Password baru')).toHaveValue('baru-12345');
    expect(fault.requests).toHaveLength(1);
    await sheet(page).getByRole('button', { name: 'BATAL' }).click();

    // Deactivate: error toast, the cashier stays active, one request.
    await openActions(page, name, 'Nonaktifkan');
    await expect(page.getByText('Status kasir gagal diubah. Coba lagi.')).toBeVisible();
    await expect(row(page, name)).toContainText('Aktif');
    await expect(row(page, name)).not.toContainText('Nonaktif');
    expect(fault.requests).toHaveLength(2);
    await expectQuiet(fault.requests);

    // The server recovers: each action now works, once.
    await fault.clear();
    await page.keyboard.press('Escape');
    await openActions(page, name, 'Reset Password');
    await sheet(page).getByLabel('Password baru').fill('baru-12345');
    await sheet(page).getByRole('button', { name: 'RESET PASSWORD' }).click();
    await expect(page.getByText(`Password ${name} direset.`)).toBeVisible();

    await openActions(page, name, 'Nonaktifkan');
    await expect(page.getByText(`${name} dinonaktifkan.`)).toBeVisible();
    await expect(row(page, name)).toContainText('Nonaktif');
    await openActions(page, name, 'Aktifkan');
    await expect(page.getByText(`${name} diaktifkan.`)).toBeVisible();
  });

  test('timeout: a stalled reset or status change is sent once, then released with an error', async ({ page }) => {
    test.setTimeout(150_000);
    const name = await withNewCashier(page);
    const fault = await injectFault(page, ADMIN_FUNCTION, 'hang', { methods: ['POST'] });

    await openActions(page, name, 'Reset Password');
    await sheet(page).getByLabel('Password baru').fill('baru-12345');
    await sheet(page).getByRole('button', { name: 'RESET PASSWORD' }).click();
    await expect(sheet(page).getByRole('button', { name: 'MENYIMPAN…' })).toBeDisabled();
    await expect(sheet(page).getByText('Tidak dapat terhubung ke server')).toBeVisible({ timeout: TIMEOUT_WAIT_MS });
    expect(fault.requests).toHaveLength(1);
    await sheet(page).getByRole('button', { name: 'BATAL' }).click();

    await openActions(page, name, 'Nonaktifkan');
    // While waiting, the action button is busy so it cannot be tapped twice.
    await expect(sheet(page).getByRole('button', { name: 'MEMPROSES…' })).toBeDisabled();
    await expect(page.getByText('Tidak dapat terhubung ke server')).toBeVisible({ timeout: TIMEOUT_WAIT_MS });
    expect(fault.requests).toHaveLength(2);
    await expect(row(page, name)).toContainText('Aktif');
    await expect(row(page, name)).not.toContainText('Nonaktif');
  });
});

import { readFileSync } from 'node:fs';
import { expect, FAILED_REQUEST, test, type Browser, type Page } from './support/test';

// Requires the local Supabase stack (with the edge runtime), the dev seed, and .env.local
// (see docs/RUNBOOK.md). Creates a cashier account through the admin-cashier Edge Function and
// changes the store's receipt note (restored at the end). Accounts cannot be deleted from the app,
// so the new cashier stays; run `npx supabase db reset` to return to the seed. Runs in the serial
// "mutations" project (see playwright.config.ts).

const PASSWORD = 'password123';
const OWNER = 'owner.a@warungkasir.test';

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'MASUK' }).click();
}

async function loginAsOwner(page: Page) {
  await login(page, OWNER);
  await expect(page).toHaveURL(/\/kasir$/);
}

/** Tries a login in a fresh browser context (no shared session) and reports where it ended. */
async function tryLogin(browser: Browser, email: string, password: string): Promise<{ url: string; alert: string | null }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await login(page, email, password);
    // Next.js renders an empty role="alert" route announcer; only a message with text counts.
    const message = page.getByRole('alert').filter({ hasText: /\S/ });
    await Promise.race([
      page.waitForURL(/\/kasir$/, { timeout: 15_000 }),
      message.first().waitFor({ timeout: 15_000 }),
    ]);
    const alert = (await message.count()) > 0 ? await message.first().textContent() : null;
    return { url: page.url(), alert };
  } finally {
    await context.close();
  }
}

const row = (page: Page, name: string) => page.getByRole('main').getByRole('listitem').filter({ hasText: name });
const sheet = (page: Page) => page.getByRole('dialog');

async function openActions(page: Page, name: string, action: string) {
  await page.getByRole('button', { name: `Aksi untuk ${name}` }).click();
  await sheet(page).getByRole('button', { name: action }).click();
}

test('employee golden flow: create, edit name, reset password, deactivate, reactivate (US-06)', async ({ page, browser, allowConsoleError }) => {
  // The duplicate email this test submits on purpose: a 409, which the app reports as email_taken.
  allowConsoleError(FAILED_REQUEST, /^admin-cashier create: refused: email_taken$/);
  const tag = Date.now().toString(36);
  const name = `Kasir E2E ${tag}`;
  const renamed = `Kasir E2E Baru ${tag}`;
  const email = `e2e-${tag}@warungkasir.test`;
  const firstPassword = 'awal-12345';
  const newPassword = 'baru-12345';

  await loginAsOwner(page);
  await page.goto('/karyawan');

  // --- Create, with inline validation first ---------------------------------------------------
  await page.getByRole('button', { name: /TAMBAH KASIR/ }).click();
  await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
  await expect(sheet(page).getByText('Nama wajib diisi.')).toBeVisible();
  await expect(sheet(page).getByText('Email login wajib diisi.')).toBeVisible();
  await expect(sheet(page).getByText('Password wajib diisi.')).toBeVisible();

  await sheet(page).getByLabel('Nama').fill(name);
  await sheet(page).getByLabel('Email login').fill(email);
  await sheet(page).getByLabel('Password', { exact: true }).fill('pendek');
  await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
  await expect(sheet(page).getByText('Password minimal 8 karakter.')).toBeVisible();

  await sheet(page).getByLabel('Password', { exact: true }).fill(firstPassword);
  await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
  await expect(page.getByText(`Akun kasir ${name} dibuat.`)).toBeVisible();
  await expect(row(page, name)).toContainText('Aktif');

  // The same login email cannot be used twice; the server says so on the email field.
  await page.getByRole('button', { name: /TAMBAH KASIR/ }).click();
  await sheet(page).getByLabel('Nama').fill('Duplikat');
  await sheet(page).getByLabel('Email login').fill(email.toUpperCase());
  await sheet(page).getByLabel('Password', { exact: true }).fill(firstPassword);
  await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
  await expect(sheet(page).getByText('Email ini sudah dipakai akun lain. Gunakan email lain.')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'BATAL' }).click();

  // --- Edit profile (name only) ----------------------------------------------------------------
  await openActions(page, name, 'Edit Profil');
  await expect(sheet(page).getByLabel('Nama')).toHaveValue(name);
  await sheet(page).getByLabel('Nama').fill(renamed);
  await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
  await expect(page.getByText('Nama kasir diperbarui.')).toBeVisible();
  await page.reload();
  await expect(row(page, renamed)).toContainText('Aktif');

  // --- Reset password ---------------------------------------------------------------------------
  await openActions(page, renamed, 'Reset Password');
  await sheet(page).getByLabel('Password baru').fill(newPassword);
  await sheet(page).getByRole('button', { name: 'RESET PASSWORD' }).click();
  await expect(page.getByText(`Password ${renamed} direset.`)).toBeVisible();

  // --- Deactivate: inactive in the list, and the account can no longer sign in ------------------
  await openActions(page, renamed, 'Nonaktifkan');
  await expect(page.getByText(`${renamed} dinonaktifkan.`)).toBeVisible();
  await expect(row(page, renamed)).toContainText('Nonaktif');
  await page.reload();
  await expect(row(page, renamed)).toContainText('Nonaktif');

  const whileInactive = await tryLogin(browser, email, newPassword);
  expect(whileInactive.url).toMatch(/\/login/);
  expect(whileInactive.alert).toBe('Akun tidak aktif atau belum terdaftar. Hubungi Owner.');

  // --- Reactivate: active again, and the new password works (the first one does not) -------------
  await openActions(page, renamed, 'Aktifkan');
  await expect(page.getByText(`${renamed} diaktifkan.`)).toBeVisible();
  await page.reload();
  await expect(row(page, renamed)).toContainText('Aktif');
  await expect(row(page, renamed)).not.toContainText('Nonaktif');

  const oldPassword = await tryLogin(browser, email, firstPassword);
  expect(oldPassword.alert).toBe('Email atau password salah.');
  const reactivated = await tryLogin(browser, email, newPassword);
  expect(reactivated.url).toMatch(/\/kasir$/);

  // --- The employee export lists the new cashier, never its email or password -------------------
  await page.goto('/backup');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'UNDUH CSV Export Karyawan' }).click(),
  ]);
  const csv = readFileSync(await download.path(), 'utf8');
  expect(csv).toContain(`"${renamed}","cashier",true`);
  expect(csv).not.toContain(email);
  expect(csv).not.toContain(newPassword);
  expect(csv).not.toContain(firstPassword);
});

test('settings: edit the store profile and receipt note; changes persist after reload', async ({ page }) => {
  const tag = Date.now().toString(36);
  const note = `Catatan E2E ${tag}`;
  const phone = '0812 3456 7890';

  await loginAsOwner(page);
  await page.goto('/pengaturan');
  await expect(page.getByRole('main').getByText('Warung Makan Bu Sari')).toBeVisible();

  // Receipt note
  await page.getByRole('button', { name: 'Ubah catatan struk' }).click();
  const original = await sheet(page).getByLabel('Catatan struk').inputValue();
  await sheet(page).getByLabel('Catatan struk').fill(note);
  await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
  await expect(page.getByText('Pengaturan disimpan.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('main').getByText(note)).toBeVisible();

  // Store profile: validation, then a phone change
  await page.getByRole('button', { name: 'Ubah profil warung' }).click();
  const originalPhone = await sheet(page).getByLabel('Telepon').inputValue();
  await sheet(page).getByLabel('Nama warung').fill('  ');
  await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
  await expect(sheet(page).getByText('Nama warung wajib diisi.')).toBeVisible();
  await sheet(page).getByLabel('Nama warung').fill('Warung Makan Bu Sari');
  await sheet(page).getByLabel('Telepon').fill(phone);
  await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
  await expect(page.getByText('Pengaturan disimpan.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('main').getByText(phone)).toBeVisible();

  // Restore the seed values so other specs see the usual store.
  await page.getByRole('button', { name: 'Ubah catatan struk' }).click();
  await sheet(page).getByLabel('Catatan struk').fill(original);
  await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
  await expect(page.getByText('Pengaturan disimpan.')).toBeVisible();
  await page.getByRole('button', { name: 'Ubah profil warung' }).click();
  await sheet(page).getByLabel('Telepon').fill(originalPhone);
  await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
  await expect(page.getByText('Pengaturan disimpan.').first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('main').getByText(original)).toBeVisible();
});

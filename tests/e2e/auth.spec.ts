import { editStoredSession, EXPIRED_AT } from './support/session';
import { expect, FAILED_REQUEST, test, type Page } from './support/test';

// Requires the local Supabase stack with the dev seed (`npx supabase start`,
// `npx supabase db reset`) and .env.local pointing at it. See docs/RUNBOOK.md.
//
// Auth flows do not depend on the viewport; run them once so the suite stays
// under the local Auth sign-in rate limit.
test.skip(({ viewport }) => viewport?.width !== 360, 'auth flows run on the 360px viewport only');

const PASSWORD = 'password123';

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'MASUK' }).click();
}

test('a private page redirects to login without a session (AC-13)', async ({ page }) => {
  await page.goto('/kasir');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('searchbox', { name: 'Cari menu' })).toHaveCount(0);
});

test('empty fields are validated inline', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'MASUK' }).click();

  await expect(page.getByText('Email wajib diisi.')).toBeVisible();
  await expect(page.getByText('Password wajib diisi.')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('a wrong password is rejected', async ({ page, allowConsoleError }) => {
  allowConsoleError(FAILED_REQUEST); // the 400 the server answers with
  await login(page, 'owner.a@warungkasir.test', 'salah-password');

  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Email atau password salah.');
  await expect(page).toHaveURL(/\/login$/);
});

test('an unknown email is rejected with the same message', async ({ page, allowConsoleError }) => {
  allowConsoleError(FAILED_REQUEST);
  await login(page, 'tidak.ada@warungkasir.test');

  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Email atau password salah.');
});

test('an inactive account cannot sign in and keeps no session', async ({ page }) => {
  await login(page, 'nonaktif.a@warungkasir.test');

  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Akun tidak aktif atau belum terdaftar. Hubungi Owner.');
  await page.goto('/kasir');
  await expect(page).toHaveURL(/\/login$/);
});

test('the owner signs in, keeps the session across reload and reopen, and signs out', async ({ page, context }) => {
  await login(page, 'owner.a@warungkasir.test');
  await expect(page).toHaveURL(/\/kasir$/);
  await expect(page.getByRole('banner')).toContainText('Bu Sari');

  await page.reload();
  await expect(page.getByRole('banner')).toContainText('Bu Sari');

  const reopened = await context.newPage();
  await reopened.goto('/kasir');
  await expect(reopened.getByRole('banner')).toContainText('Bu Sari');
  await reopened.close();

  // With a session, the login page goes straight to the cashier (PRD §11).
  await page.goto('/login');
  await expect(page).toHaveURL(/\/kasir$/);

  // Logout lives on the Lainnya page (UI_SPEC A.7).
  await page.getByRole('link', { name: 'Lainnya' }).click();
  await page.getByRole('button', { name: 'Keluar' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/kasir');
  await expect(page).toHaveURL(/\/login$/);
});

test('a cashier signs in and sees their own name', async ({ page }) => {
  await login(page, 'kasir1.a@warungkasir.test');

  await expect(page).toHaveURL(/\/kasir$/);
  await expect(page.getByRole('banner')).toContainText('Andi');
});

test('a session the server rejects sends the user back to login', async ({ page, allowConsoleError }) => {
  allowConsoleError(FAILED_REQUEST);
  await login(page, 'kasir2.a@warungkasir.test');
  await expect(page.getByRole('banner')).toContainText('Budi');

  // Simulate an expired access token whose refresh token was revoked.
  await editStoredSession(page, { expires_at: EXPIRED_AT, refresh_token: 'revoked-token' });
  await page.reload();

  await expect(page).toHaveURL(/\/login(\?alasan=expired)?$/);
  await page.goto('/kasir');
  await expect(page).toHaveURL(/\/login$/);
});

test('SEC-02: before JavaScript runs, the login form cannot send the credentials anywhere', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  const page = await context.newPage();
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  try {
    await page.goto('/login');
    const submit = page.getByRole('button', { name: 'MASUK' });
    await expect(submit).toBeDisabled();
    await expect(page.locator('form')).toHaveAttribute('method', 'post');

    await page.getByLabel('Email').fill('audit@warungkasir.test');
    await page.getByRole('textbox', { name: 'Password' }).fill('rahasia-12345');
    await page.getByRole('textbox', { name: 'Password' }).press('Enter');
    await submit.click({ trial: true, timeout: 1_000 }).catch(() => {}); // disabled: cannot be clicked
    await page.waitForTimeout(1_000);

    expect(new URL(page.url()).search).toBe('');
    for (const url of urls) {
      expect(url).not.toContain('rahasia');
      expect(url).not.toContain('audit%40warungkasir');
    }
  } finally {
    await context.close();
  }
});

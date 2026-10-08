import { expect, test, type Page } from '@playwright/test';

// Requires the local Supabase stack with the dev seed and .env.local (see docs/RUNBOOK.md).
// Each viewport project signs in once per role: 2 sign-ins x 3 projects stays well under the
// local Auth sign-in rate limit.

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

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function expectTouchTarget(locator: ReturnType<Page['locator']>, minHeight = 48) {
  const box = await locator.boundingBox();
  expect(box, 'control is visible').not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(minHeight);
  expect(box!.width).toBeGreaterThanOrEqual(44);
}

test('owner shell: four tabs, Lainnya contents, no overflow, 48px targets', async ({ page }) => {
  await login(page, OWNER);

  const bottomNav = page.getByRole('navigation', { name: 'Navigasi utama' });
  await expect(bottomNav.getByRole('link')).toHaveText(['Kasir', 'Riwayat', 'Laporan', 'Lainnya']);
  await expect(bottomNav.getByRole('link', { name: 'Kasir' })).toHaveAttribute('aria-current', 'page');
  // The sidebar is for tablet and desktop only.
  await expect(page.getByRole('navigation', { name: 'Navigasi samping' })).toBeHidden();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  for (const tab of await bottomNav.getByRole('link').all()) await expectTouchTarget(tab);

  await bottomNav.getByRole('link', { name: 'Lainnya' }).click();
  await expect(page.getByRole('heading', { name: 'Lainnya', level: 1 })).toBeVisible();
  for (const label of ['Menu', 'Kategori', 'Karyawan', 'Backup / Export', 'Pengaturan', 'Tentang']) {
    const row = page.getByRole('main').getByRole('link', { name: label });
    await expect(row).toBeVisible();
    await expectTouchTarget(row);
  }
  await expect(page.getByRole('main').getByText('Status sinkronisasi')).toBeVisible();
  await expectTouchTarget(page.getByRole('main').getByRole('button', { name: 'Keluar' }));
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // Menu is reached through Lainnya, so that tab stays highlighted.
  await page.getByRole('main').getByRole('link', { name: 'Menu' }).click();
  await expect(page).toHaveURL(/\/menu$/);
  await expect(bottomNav.getByRole('link', { name: 'Lainnya' })).toHaveAttribute('aria-current', 'page');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('cashier shell: three tabs, limited Lainnya, owner pages denied (AC-07)', async ({ page }) => {
  await login(page, CASHIER);

  const bottomNav = page.getByRole('navigation', { name: 'Navigasi utama' });
  await expect(bottomNav.getByRole('link')).toHaveText(['Kasir', 'Riwayat', 'Lainnya']);

  await bottomNav.getByRole('link', { name: 'Lainnya' }).click();
  const main = page.getByRole('main');
  await expect(main.getByText('Andi')).toBeVisible();
  await expect(main.getByRole('link')).toHaveText(['Tentang']);
  await expect(main.getByText('Status sinkronisasi')).toBeVisible();
  await expect(main.getByRole('button', { name: 'Keluar' })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await page.goto('/laporan');
  await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible();
  await expectTouchTarget(page.getByRole('link', { name: 'KEMBALI KE KASIR' }));
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test.describe('desktop layout', () => {
  test.skip(({ viewport }) => viewport?.width !== 360, 'desktop layout is checked once, on the 360px project');
  test.use({ viewport: { width: 1280, height: 800 } });

  test('the sidebar replaces the bottom navigation and the top bar', async ({ page }) => {
    await login(page, OWNER);

    const sidebar = page.getByRole('navigation', { name: 'Navigasi samping' });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole('link')).toHaveText([
      'Kasir',
      'Riwayat',
      'Laporan',
      'Menu',
      'Kategori',
      'Karyawan',
      'Backup / Export',
      'Pengaturan',
      'Tentang',
    ]);
    await expect(page.getByRole('navigation', { name: 'Navigasi utama' })).toBeHidden();
    await expect(page.getByRole('banner')).toBeHidden();
    await expect(page.getByRole('complementary').getByText('Bu Sari')).toBeVisible();

    await sidebar.getByRole('link', { name: 'Karyawan' }).click();
    await expect(page).toHaveURL(/\/karyawan$/);
    await expect(sidebar.getByRole('link', { name: 'Karyawan' })).toHaveAttribute('aria-current', 'page');
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    await page.getByRole('complementary').getByRole('button', { name: 'Keluar' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

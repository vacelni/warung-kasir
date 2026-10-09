import { expect, test, type Locator, type Page } from './support/test';

// Requires the local Supabase stack with the dev seed and .env.local (see docs/RUNBOOK.md).
// Seed store A: Nasi Goreng 15.000, Es Teh 5.000. Read-only: this spec never presses BAYAR, so it
// runs once per viewport. Saving a sale is covered by checkout.mutation.spec.ts.

const PASSWORD = 'password123';
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

const card = (page: Page, name: string) => page.getByRole('main').getByRole('button', { name: new RegExp(`^${name}`) });

test('payment screen: total, numeric input, shortfall, quick amounts set the value, fits the phone', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, 'checks the phone layout (bottom navigation); the desktop layout has its own spec');
  await login(page, CASHIER);

  // Nasi Goreng ×2 + Es Teh ×2 = Rp40.000.
  for (const name of ['Nasi Goreng', 'Nasi Goreng', 'Es Teh', 'Es Teh']) await card(page, name).click();
  await page.getByRole('link', { name: 'LIHAT PESANAN' }).click();
  await expectTouchTarget(page.getByRole('link', { name: 'LANJUT BAYAR' }));
  await page.getByRole('link', { name: 'LANJUT BAYAR' }).click();

  await expect(page).toHaveURL(/\/kasir\/bayar$/);
  await expect(page.getByRole('heading', { name: 'Pembayaran', level: 1 })).toBeVisible();

  // Until BAYAR, the payment screen never talks to the database.
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/rest/v1/')) apiRequests.push(request.url());
  });

  const main = page.getByRole('main');
  const total = main.getByRole('region', { name: 'Total' });
  const paid = main.getByLabel('Uang diterima');
  const pay = main.getByRole('button', { name: 'BAYAR' });
  const quick = main.getByRole('group', { name: 'Nominal cepat' });
  const change = main.getByRole('region', { name: 'Kembalian' });

  await expect(total).toContainText('Rp40.000');
  await expect(paid).toHaveAttribute('inputmode', 'numeric');
  await expect(pay).toBeDisabled();

  await expectTouchTarget(paid);
  await expectTouchTarget(pay);
  await expect(quick.getByRole('button')).toHaveText(['Rp10.000', 'Rp20.000', 'Rp50.000', 'Rp100.000', 'Rp200.000', 'UANG PAS']);
  for (const button of await quick.getByRole('button').all()) await expectTouchTarget(button);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // Typed key by key, as on the phone keyboard: the field formats as it goes.
  await paid.pressSequentially('30000');
  await expect(paid).toHaveValue('Rp30.000');
  await expect(main.getByText('Uang pembayaran kurang Rp10.000')).toBeVisible();
  await expect(pay).toBeDisabled();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await paid.fill('50000');
  await expect(paid).toHaveValue('Rp50.000');
  await expect(change).toContainText('Rp10.000');
  await expect(main.getByText(/Uang pembayaran kurang/)).toHaveCount(0);
  await expect(pay).toBeEnabled();

  // A quick amount SETS the paid amount: 20.000 then Rp50.000 is 50.000, not 70.000.
  await paid.fill('20000');
  await quick.getByRole('button', { name: 'Rp50.000' }).click();
  await expect(paid).toHaveValue('Rp50.000');
  await expect(change).toContainText('Rp10.000');

  await quick.getByRole('button', { name: 'UANG PAS' }).click();
  await expect(paid).toHaveValue('Rp40.000');
  await expect(change).toContainText('Rp0');

  // Manual input after a quick amount replaces it.
  await quick.getByRole('button', { name: 'Rp100.000' }).click();
  await paid.fill('45000');
  await expect(paid).toHaveValue('Rp45.000');
  await expect(change).toContainText('Rp5.000');

  // BAYAR stays inside the screen above the bottom navigation.
  await pay.scrollIntoViewIfNeeded();
  const payBox = await pay.boundingBox();
  const navBox = await page.getByRole('navigation', { name: 'Navigasi utama' }).boundingBox();
  if (navBox) expect(payBox!.y + payBox!.height).toBeLessThanOrEqual(navBox.y);

  expect(apiRequests, 'the payment screen makes no request before BAYAR').toEqual([]);

  // Back to the order: still intact, nothing was saved.
  await page.getByRole('link', { name: 'Kembali ke pesanan' }).click();
  await expect(page).toHaveURL(/\/kasir\/pesanan$/);
  await expect(main.getByRole('listitem')).toHaveCount(2);
});

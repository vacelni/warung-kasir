import { expect, FAILED_REQUEST, test, type Page } from './support/test';

// Requires the local Supabase stack with the dev seed and .env.local (see docs/RUNBOOK.md).
// Seed store A: categories Makanan, Minuman, Snack; Nasi Goreng 15.000 (active), Nasi Rames 13.000 (inactive).
// Products cannot be deleted (MVP), so this flow leaves one inactive product behind;
// run `npx supabase db reset` to return to the seed.
// Changes shared catalog data, so it runs in the serial "mutations" project, after every
// read-only spec has finished (see playwright.config.ts).

const PASSWORD = 'password123';
const OWNER = 'owner.a@warungkasir.test';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'MASUK' }).click();
  await expect(page).toHaveURL(/\/kasir$/);
}

const row = (page: Page, name: string) => page.getByRole('main').getByRole('listitem').filter({ hasText: name });
const sheet = (page: Page) => page.getByRole('dialog');

test.describe('owner management flow', () => {
  test('categories and products: create, edit, deactivate, reactivate, protected delete — persisted', async ({ page, allowConsoleError }) => {
  // The duplicate category name this test submits on purpose (409, unique violation).
  allowConsoleError(FAILED_REQUEST, /^Could not create the category:/);
    const tag = Date.now().toString(36);
    const category = `E2E ${tag}`;
    const renamed = `E2E Baru ${tag}`;
    const unused = `E2E Kosong ${tag}`;
    const product = `Menu E2E ${tag}`;

    await login(page, OWNER);

    // --- Categories: create, duplicate rejected, rename -----------------------------------
    await page.goto('/kategori');
    await page.getByRole('button', { name: /TAMBAH KATEGORI/ }).click();
    await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
    await expect(sheet(page).getByText('Nama kategori wajib diisi.')).toBeVisible();
    await sheet(page).getByLabel('Nama kategori').fill(category);
    await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
    await expect(page.getByText('Kategori ditambahkan.')).toBeVisible();
    await expect(row(page, category)).toContainText('0 menu');

    await page.getByRole('button', { name: /TAMBAH KATEGORI/ }).click();
    await sheet(page).getByLabel('Nama kategori').fill(category);
    await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
    await expect(sheet(page).getByRole('alert')).toHaveText('Kategori dengan nama ini sudah ada. Gunakan nama lain.');
    await sheet(page).getByRole('button', { name: 'BATAL' }).click();

    await page.getByRole('button', { name: `Aksi untuk ${category}` }).click();
    await sheet(page).getByRole('button', { name: 'Ubah nama' }).click();
    await expect(sheet(page).getByLabel('Nama kategori')).toHaveValue(category);
    await sheet(page).getByLabel('Nama kategori').fill(renamed);
    await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
    await expect(page.getByText('Kategori diperbarui.')).toBeVisible();
    await expect(row(page, renamed)).toBeVisible();

    // --- Products: validation, create, persisted across reload ----------------------------
    await page.goto('/menu');
    await page.getByRole('button', { name: /TAMBAH MENU/ }).click();
    await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
    await expect(sheet(page).getByText('Nama menu wajib diisi.')).toBeVisible();
    await expect(sheet(page).getByText('Pilih kategori.')).toBeVisible();
    await expect(sheet(page).getByText('Harga wajib diisi.')).toBeVisible();

    await sheet(page).getByLabel('Nama menu').fill(product);
    await sheet(page).getByLabel('Kategori').selectOption({ label: renamed });
    for (const [price, message] of [
      ['0', 'Harga harus lebih dari Rp0.'],
      ['-5000', 'Harga harus berupa angka bulat, tanpa titik, koma, atau tanda minus.'],
      ['12000.5', 'Harga harus berupa angka bulat, tanpa titik, koma, atau tanda minus.'],
    ] as const) {
      await sheet(page).getByLabel('Harga (Rp)').fill(price);
      await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
      await expect(sheet(page).getByText(message)).toBeVisible();
    }
    await sheet(page).getByLabel('Harga (Rp)').fill('12000');
    await expect(sheet(page).getByText('Rp12.000')).toBeVisible();
    await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
    await expect(page.getByText('Menu ditambahkan.')).toBeVisible();
    await expect(row(page, product)).toContainText('Rp12.000');
    await expect(row(page, product)).toContainText(renamed);
    await expect(row(page, product)).toContainText('Aktif');

    await page.reload();
    await expect(row(page, product)).toContainText('Rp12.000');

    // --- Edit price ------------------------------------------------------------------------
    await page.getByRole('button', { name: `Aksi untuk ${product}` }).click();
    await sheet(page).getByRole('button', { name: 'Edit' }).click();
    await expect(sheet(page).getByLabel('Harga (Rp)')).toHaveValue('12000');
    await sheet(page).getByLabel('Harga (Rp)').fill('0');
    await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
    await expect(sheet(page).getByText('Harga harus lebih dari Rp0.')).toBeVisible();
    await sheet(page).getByLabel('Harga (Rp)').fill('13500');
    await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
    await expect(page.getByText('Menu diperbarui.')).toBeVisible();
    await page.reload();
    await expect(row(page, product)).toContainText('Rp13.500');

    // --- Deactivate / reactivate (there is no delete) ---------------------------------------
    await page.getByRole('button', { name: `Aksi untuk ${product}` }).click();
    await expect(sheet(page).getByRole('button', { name: /hapus|delete/i })).toHaveCount(0);
    await sheet(page).getByRole('button', { name: 'Nonaktifkan' }).click();
    await expect(page.getByText(`${product} dinonaktifkan.`)).toBeVisible();
    await expect(row(page, product)).toContainText('Nonaktif');
    await page.reload();
    await expect(row(page, product)).toContainText('Nonaktif');

    await page.getByRole('button', { name: `Aksi untuk ${product}` }).click();
    await sheet(page).getByRole('button', { name: 'Aktifkan' }).click();
    await expect(page.getByText(`${product} diaktifkan.`)).toBeVisible();
    await page.reload();
    await expect(row(page, product)).toContainText('Aktif');
    await expect(row(page, product)).not.toContainText('Nonaktif');

    // --- Category delete protection, inactive products included ---------------------------
    await page.goto('/kategori');
    await expect(row(page, renamed)).toContainText('1 menu');
    await page.getByRole('button', { name: `Aksi untuk ${renamed}` }).click();
    await sheet(page).getByRole('button', { name: 'Hapus' }).click();
    await expect(sheet(page).getByRole('heading', { name: 'Kategori tidak dapat dihapus' })).toBeVisible();
    await expect(sheet(page)).toContainText('masih dipakai oleh 1 menu, termasuk menu yang nonaktif');
    await expect(sheet(page).getByRole('button', { name: 'HAPUS' })).toHaveCount(0);
    await sheet(page).getByRole('button', { name: 'TUTUP', exact: true }).click();

    // Deactivate the only product: the category is still in use.
    await page.goto('/menu');
    await page.getByRole('button', { name: `Aksi untuk ${product}` }).click();
    await sheet(page).getByRole('button', { name: 'Nonaktifkan' }).click();
    await expect(row(page, product)).toContainText('Nonaktif');
    await page.goto('/kategori');
    await expect(row(page, renamed)).toContainText('1 menu');
    await page.getByRole('button', { name: `Aksi untuk ${renamed}` }).click();
    await sheet(page).getByRole('button', { name: 'Hapus' }).click();
    await expect(sheet(page)).toContainText('termasuk menu yang nonaktif');
    await expect(sheet(page).getByRole('button', { name: 'HAPUS' })).toHaveCount(0);
    await sheet(page).getByRole('button', { name: 'TUTUP', exact: true }).click();

    // --- An unused category can be deleted, and stays deleted -------------------------------
    await page.getByRole('button', { name: /TAMBAH KATEGORI/ }).click();
    await sheet(page).getByLabel('Nama kategori').fill(unused);
    await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
    await expect(row(page, unused)).toContainText('0 menu');
    await page.getByRole('button', { name: `Aksi untuk ${unused}` }).click();
    await sheet(page).getByRole('button', { name: 'Hapus' }).click();
    await expect(sheet(page).getByText(`Kategori "${unused}" akan dihapus.`)).toBeVisible();
    await sheet(page).getByRole('button', { name: 'HAPUS' }).click();
    await expect(page.getByText('Kategori dihapus.')).toBeVisible();
    await expect(row(page, unused)).toHaveCount(0);
    await page.reload();
    await expect(row(page, renamed)).toBeVisible();
    await expect(row(page, unused)).toHaveCount(0);
  });
});

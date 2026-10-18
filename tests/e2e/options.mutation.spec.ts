import { readFileSync } from 'node:fs';
import { layoutProblems } from './support/layout';
import { expect, test, type Download, type Page, type Request } from './support/test';

// Requires the local Supabase stack with the dev seed and .env.local (see docs/RUNBOOK.md).
// Product options (DATABASE D.12): the owner builds option groups and a "Geprek" menu item, a
// cashier sells it with choices, and the sale reads back with them in Riwayat, the receipt, the
// database, and the CSV export. Three tests that depend on each other, in order (the mutations
// project is serial). Names carry a tag so a rerun never collides; products cannot be deleted
// (MVP), so run `npx supabase db reset` afterwards to return to the seed.

const PASSWORD = 'password123';
const OWNER = 'owner.a@warungkasir.test';
const CASHIER = 'kasir1.a@warungkasir.test';
const RPC = '/rest/v1/rpc/create_transaction';

const tag = Date.now().toString(36);
const GEPREK = `Geprek E2E ${tag}`;
const LEVEL = `Level ${tag}`;
const NASI = `Nasi ${tag}`;
const BAGIAN = `Bagian ${tag}`;
const EXTRA = `Tambahan ${tag}`;

// Geprek Rp12.000. Nasi (optional) +4.000; Level (required, free); Bagian ayam (required, Paha default +1.000, Dada +3.000);
// Tambahan (many, optional): Telur +3.000.
const BASE_PRICE = '12000';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'MASUK' }).click();
  await expect(page).toHaveURL(/\/kasir$/);
}

const sheet = (page: Page) => page.getByRole('dialog');
const main = (page: Page) => page.getByRole('main');
const card = (page: Page, name: string) => main(page).getByRole('button', { name: new RegExp(`^${name}`) });

/** Creates a group in the owner screen and leaves its sheet open in edit mode, ready for choices. */
async function createGroup(page: Page, name: string, options: { multiple?: boolean; required: boolean }) {
  await page.getByRole('button', { name: /TAMBAH GRUP/ }).first().click();
  await sheet(page).getByLabel('Nama', { exact: true }).fill(name);
  if (options.multiple) await sheet(page).getByRole('button', { name: 'Boleh banyak' }).click();
  const required = sheet(page).getByRole('checkbox', { name: /Wajib dipilih/ });
  if ((await required.isChecked()) !== options.required) await required.click();
  await sheet(page).getByRole('button', { name: 'SIMPAN DAN ISI PILIHAN' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Ubah pilihan menu' })).toBeVisible();
}

async function addChoice(page: Page, name: string, price?: string) {
  await sheet(page).getByLabel('Nama pilihan').last().fill(name);
  if (price) await sheet(page).getByLabel('Tambahan harga (Rp)').last().fill(price);
  await sheet(page).getByRole('button', { name: 'TAMBAH PILIHAN' }).click();
  await expect(sheet(page).getByText(name, { exact: true })).toBeVisible();
}

// The sale made by the cashier test, read again by the owner test.
let soldId = '';

test.describe.configure({ mode: 'serial' });

test('owner: builds option groups with priced choices and attaches them to a new menu item', async ({ page }) => {
  await login(page, OWNER);
  await page.goto('/pilihan');
  await expect(page.getByRole('heading', { name: 'Pilihan Menu', level: 1 })).toBeVisible();

  // --- Nasi: optional, pick one, one priced choice ---------------------------------------
  await createGroup(page, NASI, { required: false });
  await addChoice(page, 'Pakai nasi', '4000');
  await expect(sheet(page).getByText('+Rp4.000')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'TUTUP', exact: true }).click();

  // --- Level: required, pick one, free choices; a bad price is refused ---------------------
  await createGroup(page, LEVEL, { required: true });
  await sheet(page).getByLabel('Nama pilihan').last().fill('Level 1');
  await sheet(page).getByLabel('Tambahan harga (Rp)').last().fill('4.000');
  await sheet(page).getByRole('button', { name: 'TAMBAH PILIHAN' }).click();
  await expect(sheet(page).getByText(/angka bulat/)).toBeVisible();
  await sheet(page).getByLabel('Tambahan harga (Rp)').last().fill('');
  await sheet(page).getByRole('button', { name: 'TAMBAH PILIHAN' }).click();
  await expect(sheet(page).getByText('Level 1', { exact: true })).toBeVisible();
  await addChoice(page, 'Level 3');
  await addChoice(page, 'Level 5');
  // The group sheet, with its choices, fits the phone: no sideways scroll, targets big enough.
  expect(await layoutProblems(page), 'layout of the option group sheet').toEqual([]);
  await sheet(page).getByRole('button', { name: 'TUTUP', exact: true }).click();

  // --- Bagian ayam: required, Paha is the default ------------------------------------------
  await createGroup(page, BAGIAN, { required: true });
  await addChoice(page, 'Dada', '3000');
  await addChoice(page, 'Paha', '1000');
  const paha = sheet(page).getByText('Paha', { exact: true }).locator('xpath=ancestor::li[1]');
  await paha.getByRole('checkbox', { name: /Terpilih otomatis/ }).click();
  await expect(paha.getByRole('checkbox', { name: /Terpilih otomatis/ })).toBeChecked();
  await expect(paha.getByText('Otomatis')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'TUTUP', exact: true }).click();

  // --- Tambahan: many, optional -------------------------------------------------------------
  await createGroup(page, EXTRA, { multiple: true, required: false });
  await addChoice(page, 'Telur', '3000');
  await sheet(page).getByRole('button', { name: 'TUTUP', exact: true }).click();

  const list = main(page).getByRole('listitem');
  await expect(list.filter({ hasText: BAGIAN })).toContainText('Wajib');
  await expect(list.filter({ hasText: EXTRA })).toContainText('Boleh banyak');
  await expect(list.filter({ hasText: NASI })).toContainText('Opsional');

  // --- The menu item, with the groups in the order they are ticked ---------------------------
  await page.goto('/menu');
  await page.getByRole('button', { name: /TAMBAH MENU/ }).click();
  await sheet(page).getByLabel('Nama menu').fill(GEPREK);
  await sheet(page).getByLabel('Kategori').selectOption({ label: 'Makanan' });
  await sheet(page).getByLabel('Harga (Rp)').fill(BASE_PRICE);
  for (const name of [NASI, LEVEL, BAGIAN, EXTRA]) await sheet(page).getByRole('checkbox', { name: new RegExp(name) }).check();
  await expect(sheet(page).getByText(/Urutan 3 · Wajib/)).toBeVisible();
  await sheet(page).getByRole('button', { name: 'SIMPAN' }).click();
  await expect(page.getByText('Menu ditambahkan.')).toBeVisible();
  await expect(main(page).getByRole('listitem').filter({ hasText: GEPREK })).toContainText('4 pilihan');

  // Persisted: still attached after a reload, in the same order.
  await page.reload();
  await page.getByRole('button', { name: `Aksi untuk ${GEPREK}` }).click();
  await sheet(page).getByRole('button', { name: 'Edit' }).click();
  await expect(sheet(page).getByText(/Urutan 1 · Opsional/)).toBeVisible();
  await expect(sheet(page).getByText(/Urutan 4 · Opsional/)).toBeVisible();
});

test('cashier: sells the item with choices; the price adds up, the sale syncs, and the choices are stored', async ({ page }) => {
  await login(page, CASHIER);

  await expect(card(page, GEPREK)).toContainText('Ada pilihan');
  await card(page, GEPREK).click();
  const add = sheet(page).getByRole('button', { name: /^TAMBAH ·/ });

  // Required groups block adding. Paha is selected by default; Level is not.
  await expect(add).toBeDisabled();
  await expect(sheet(page).getByText(`Pilih dulu: ${LEVEL}`)).toBeVisible();
  await expect(sheet(page).getByRole('button', { name: /^Paha/ })).toHaveAttribute('aria-pressed', 'true');

  expect(await layoutProblems(page), 'layout of the choice sheet').toEqual([]);

  await sheet(page).getByRole('button', { name: /^Level 3/ }).click();
  await expect(add).toBeEnabled();
  await expect(add).toContainText('Rp13.000'); // 12.000 + Paha 1.000

  await sheet(page).getByRole('button', { name: /^Dada/ }).click();
  await sheet(page).getByRole('button', { name: /^Pakai nasi/ }).click();
  await sheet(page).getByRole('button', { name: /^Telur/ }).click();
  // 12.000 + Dada 3.000 + nasi 4.000 + telur 3.000 = 22.000
  await expect(add).toContainText('Rp22.000');
  await sheet(page).getByLabel('Catatan (opsional)').fill('sambal dipisah');
  await add.click();
  await expect(sheet(page)).toBeHidden();

  // A second one with different choices is its own line; the card counts both.
  await card(page, GEPREK).click();
  await sheet(page).getByRole('button', { name: /^Level 5/ }).click();
  await sheet(page).getByRole('button', { name: /^TAMBAH ·/ }).click();
  await expect(card(page, GEPREK)).toContainText('2');

  await page.getByRole('link', { name: 'LIHAT PESANAN' }).click();
  await expect(main(page).getByRole('listitem')).toHaveCount(2);
  expect(await layoutProblems(page), 'layout of the order with choices').toEqual([]);
  const lines = main(page).getByRole('listitem');
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0)).toContainText('Pakai nasi · Level 3 · Dada · Telur');
  await expect(lines.nth(0)).toContainText('Catatan: sambal dipisah');
  await expect(lines.nth(0)).toContainText('Rp22.000');
  await expect(lines.nth(1)).toContainText('Level 5 · Paha');
  await expect(lines.nth(1)).toContainText('Rp13.000');
  await expect(main(page).getByText('Total', { exact: true }).locator('xpath=following-sibling::dd')).toHaveText('Rp35.000');

  const rpcRequests: Request[] = [];
  page.on('request', (request) => {
    if (request.url().includes(RPC)) rpcRequests.push(request);
  });
  await page.getByRole('link', { name: 'LANJUT BAYAR' }).click();
  await main(page).getByLabel('Uang diterima').fill('50000');
  await expect(main(page).getByRole('region', { name: 'Kembalian' })).toContainText('Rp15.000');
  await main(page).getByRole('button', { name: 'BAYAR' }).click();

  await expect(page.getByRole('heading', { name: 'Transaksi Berhasil', level: 1 })).toBeVisible();
  await expect(main(page).getByText('Tersinkron')).toBeVisible();
  const id = new URL(page.url()).searchParams.get('id')!;
  soldId = id;

  // What was sent: the options and note travel with the line; no price is computed on the server side of the wire.
  expect(rpcRequests).toHaveLength(1);
  const body = rpcRequests[0]!.postDataJSON() as { p_total: number; p_items: Array<Record<string, unknown>> };
  expect(body.p_total).toBe(35000);
  expect(body.p_items.find((item) => item.unit_price === 22000)).toMatchObject({
    product_name: GEPREK,
    quantity: 1,
    subtotal: 22000,
    options: [
      { group: NASI, name: 'Pakai nasi', price: 4000 },
      { group: LEVEL, name: 'Level 3', price: 0 },
      { group: BAGIAN, name: 'Dada', price: 3000 },
      { group: EXTRA, name: 'Telur', price: 3000 },
    ],
    note: 'sambal dipisah',
  });

  // What the database stored, read back as the cashier through RLS.
  const headers = await rpcRequests[0]!.allHeaders();
  const url = new URL('/rest/v1/transaction_items', rpcRequests[0]!.url());
  url.searchParams.set('transaction_id', `eq.${id}`);
  url.searchParams.set('select', 'product_name,unit_price,quantity,subtotal,options,note');
  const stored = await page.request.get(url.toString(), { headers: { apikey: headers.apikey!, authorization: headers.authorization! } });
  const items = (await stored.json()) as Array<{ unit_price: number; options: unknown[]; note: string | null }>;
  expect(items).toHaveLength(2);
  const full = items.find((item) => item.unit_price === 22000)!;
  expect(full.options).toHaveLength(4);
  expect(full.note).toBe('sambal dipisah');
  expect(items.find((item) => item.unit_price === 13000)!.options).toEqual([
    { group: LEVEL, name: 'Level 5', price: 0 },
    { group: BAGIAN, name: 'Paha', price: 1000 },
  ]);

  // Riwayat detail and the receipt show the choices from the stored snapshot.
  await main(page).getByRole('link', { name: 'LIHAT DETAIL' }).click();
  const detail = main(page);
  await expect(detail).toContainText('Pakai nasi · Level 3 · Dada · Telur');
  await expect(detail).toContainText('Catatan: sambal dipisah');
  await expect(detail).toContainText('Level 5 · Paha');
  await detail.getByRole('button', { name: 'LIHAT STRUK' }).click();
  const receipt = page.getByRole('region', { name: 'Struk' });
  await expect(receipt).toContainText('Pakai nasi · Level 3 · Dada · Telur');
  await expect(receipt).toContainText('Catatan: sambal dipisah');
  await expect(receipt).toContainText('Rp35.000');
});

test('owner: the sale keeps its choices after the menu changes, and the CSV export carries them', async ({ page }) => {
  await login(page, OWNER);

  // Rename a choice and raise its price: history must not change (snapshot).
  await page.goto('/pilihan');
  await main(page).getByRole('button', { name: new RegExp(BAGIAN) }).click();
  const dada = sheet(page).getByText('Dada', { exact: true }).locator('xpath=ancestor::li[1]');
  await dada.getByRole('button', { name: 'Ubah Dada' }).click();
  // The edit form sits in the list, above the add form, so it is the first of each field.
  await sheet(page).getByLabel('Nama pilihan').first().fill('Dada Jumbo');
  await sheet(page).getByLabel('Tambahan harga (Rp)').first().fill('9000');
  await sheet(page).getByRole('button', { name: 'SIMPAN', exact: true }).click();
  await expect(sheet(page).getByText('Dada Jumbo')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'TUTUP', exact: true }).click();

  await page.goto(`/riwayat/detail?id=${soldId}`);
  await expect(main(page)).toContainText('Pakai nasi · Level 3 · Dada · Telur');
  await expect(main(page)).not.toContainText('Dada Jumbo');

  // CSV: options and note as readable text.
  await page.goto('/backup');
  const [download]: [Download, void] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'UNDUH CSV Export Item Transaksi' }).click(),
  ]);
  const csv = readFileSync(await download.path(), 'utf8');
  expect(csv).toContain(`${NASI}: Pakai nasi (+4000); ${LEVEL}: Level 3; ${BAGIAN}: Dada (+3000); ${EXTRA}: Telur (+3000)`);
  expect(csv).toContain('sambal dipisah');

  const [choicesDownload]: [Download, void] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'UNDUH CSV Export Pilihan Menu' }).click(),
  ]);
  const choices = readFileSync(await choicesDownload.path(), 'utf8');
  expect(choices).toContain('Dada Jumbo');
  expect(choices).toContain(BAGIAN);
});

import { readFileSync } from 'node:fs';
import { expect, test, type Download, type Page } from '@playwright/test';

// Requires the local Supabase stack (with the edge runtime), the dev seed, and .env.local
// (see docs/RUNBOOK.md). Read-only: it lists, opens sheets without saving, and downloads CSVs.
// Seed store A: cashiers Andi, Budi (active) and Citra (inactive); owner Bu Sari.
// Seed store B (must never appear): cashier Dewi, product Soto Ayam, sale TRX-20261007-B7D209.

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

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function expectTouchTarget(page: Page, name: string | RegExp) {
  const box = await page.getByRole('button', { name }).first().boundingBox();
  expect(box, `${name} is visible`).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(48);
}

const row = (page: Page, name: string) => page.getByRole('main').getByRole('listitem').filter({ hasText: name });

/** Clicks an export button and returns the downloaded file's name and text. */
async function downloadCsv(page: Page, label: string): Promise<{ name: string; text: string }> {
  const [download]: [Download, void] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: `UNDUH CSV ${label}` }).click(),
  ]);
  const path = await download.path();
  return { name: download.suggestedFilename(), text: readFileSync(path, 'utf8') };
}

test('owner: Karyawan, Pengaturan, and Backup render, fit, and export only store A without credentials', async ({ page }) => {
  await login(page, OWNER);

  // --- Karyawan: cashiers only, with a text status; the owner is not listed -----------------
  await page.goto('/karyawan');
  await expect(page.getByRole('heading', { name: 'Karyawan', level: 1 })).toBeVisible();
  await expect(row(page, 'Andi')).toContainText('Aktif');
  await expect(row(page, 'Citra')).toContainText('Nonaktif');
  await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('main').getByText('Bu Sari')).toHaveCount(0);
  await expect(page.getByRole('main').getByText('Dewi')).toHaveCount(0);
  await expectTouchTarget(page, 'Aksi untuk Andi');
  await expectTouchTarget(page, /TAMBAH KASIR/);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await page.getByRole('button', { name: 'Aksi untuk Andi' }).click();
  const sheet = page.getByRole('dialog');
  for (const action of ['Edit Profil', 'Reset Password', 'Nonaktifkan']) {
    await expect(sheet.getByRole('button', { name: action })).toBeVisible();
  }
  await expect(sheet.getByRole('button', { name: /hapus|role|owner/i })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Tutup' }).click();

  await page.getByRole('button', { name: /TAMBAH KASIR/ }).click();
  await expect(sheet.getByLabel('Nama')).toBeVisible();
  await expect(sheet.getByLabel('Email login')).toBeVisible();
  await expect(sheet.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  // No role picker: [+] only ever creates a cashier.
  await expect(sheet.getByRole('combobox')).toHaveCount(0);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await sheet.getByRole('button', { name: 'BATAL' }).click();

  // --- Pengaturan: grouped sections, MVP fields only -----------------------------------------
  await page.goto('/pengaturan');
  await expect(page.getByRole('heading', { name: 'Pengaturan', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Profil Warung', 'Struk', 'Data', 'Tentang']);
  await expect(page.getByRole('main').getByText('Warung Makan Bu Sari')).toBeVisible();
  await expectTouchTarget(page, 'Ubah profil warung');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // --- Backup: limits stated, no restore, real files ----------------------------------------
  await page.goto('/backup');
  await expect(page.getByText('CSV bukan cadangan lengkap.')).toBeVisible();
  await expect(page.getByRole('button', { name: /restore|pulihkan|impor/i })).toHaveCount(0);
  await expectTouchTarget(page, /BACKUP DATA/);
  await expectTouchTarget(page, 'UNDUH CSV Export Transaksi');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  const transactions = await downloadCsv(page, 'Export Transaksi');
  expect(transactions.name).toMatch(/^warungkasir-transaksi-\d{8}\.csv$/);
  expect(transactions.text.startsWith('﻿"id","code","store_id","cashier_id","cashier_name"')).toBe(true);
  expect(transactions.text).toContain('"TRX-20261007-3F9A2C"');
  // Sold at 10:32 WIB, written in Jakarta time.
  expect(transactions.text).toContain('"2026-10-07T10:32:00.000+07:00","07/10/2026","10:32"');
  expect(transactions.text).toContain(',"Andi","completed",40000,50000,10000,');
  expect(transactions.text).not.toContain('TRX-20261007-B7D209');

  const products = await downloadCsv(page, 'Export Menu');
  expect(products.text).toContain('"Nasi Rames",13000,false');
  expect(products.text).not.toContain('Soto Ayam');

  const profiles = await downloadCsv(page, 'Export Karyawan');
  const [header, ...lines] = profiles.text.replace('﻿', '').trim().split('\r\n');
  expect(header).toBe('"id","store_id","name","role","is_active","created_at","updated_at"');
  expect(profiles.text).toContain('"Bu Sari","owner",true');
  expect(profiles.text).toContain('"Citra","cashier",false');
  expect(profiles.text).not.toMatch(/@|password|encrypted|token/i);
  expect(profiles.text).not.toContain('Dewi');
  expect(lines.length).toBeGreaterThanOrEqual(4);

  // --- Desktop: the same pages fit next to the sidebar ----------------------------------------
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const path of ['/karyawan', '/pengaturan', '/backup']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  }
});

test('cashier: Karyawan, Pengaturan, and Backup are denied and show no data (AC-07, G.7)', async ({ page }) => {
  await login(page, CASHIER);
  for (const path of ['/karyawan', '/pengaturan', '/backup']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Akses ditolak' })).toBeVisible();
    await expect(page.getByRole('main').getByText('Citra')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /TAMBAH KASIR|BACKUP DATA|UNDUH CSV|Ubah/ })).toHaveCount(0);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  }
});

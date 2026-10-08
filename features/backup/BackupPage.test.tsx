// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import type { Profile } from '@/features/auth/account';
import { BackupPage } from './BackupPage';
import type { Dataset } from './datasets';

const mocks = vi.hoisted(() => ({ downloadCsv: vi.fn(), loads: new Map<string, () => Promise<unknown>>() }));

vi.mock('./download', () => ({ downloadCsv: mocks.downloadCsv }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useProfile: (): Profile => ({ id: 'o', storeId: 'store-a', name: 'Bu Sari', role: 'owner' }),
}));
vi.mock('./datasets', async (importOriginal) => {
  const original = await importOriginal<typeof import('./datasets')>();
  return {
    ...original,
    DATASETS: original.DATASETS.map(
      (d): Dataset => ({ ...d, load: (storeId) => (mocks.loads.get(d.key) ?? (() => Promise.reject(new Error(storeId))))() as never }),
    ),
  };
});

const table = (name: string) => ({ columns: ['name'], rows: [[name]] });

beforeEach(() => {
  mocks.downloadCsv.mockReset();
  mocks.loads.clear();
  for (const key of ['store', 'categories', 'products', 'transactions', 'transaction_items', 'profiles']) {
    mocks.loads.set(key, () => Promise.resolve(table(key)));
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function renderPage() {
  render(
    <ToastProvider>
      <BackupPage />
    </ToastProvider>,
  );
}

describe('backup page', () => {
  it('states the limits of a CSV backup and offers no restore', () => {
    renderPage();
    expect(screen.getByText('CSV bukan cadangan lengkap.')).toBeTruthy();
    expect(screen.getByText(/tidak dapat dipulihkan \(restore\)/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /restore|pulihkan|impor|import/i })).toBeNull();
  });

  it('offers one explicit button per table', () => {
    renderPage();
    for (const label of ['Export Transaksi', 'Export Item Transaksi', 'Export Menu', 'Export Kategori', 'Export Profil Warung', 'Export Karyawan']) {
      expect(screen.getByRole('button', { name: `UNDUH CSV ${label}` })).toBeTruthy();
    }
  });

  it('downloads one CSV with the BOM-free text and a dated name', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'UNDUH CSV Export Menu' }));
    await waitFor(() => expect(mocks.downloadCsv).toHaveBeenCalledTimes(1));
    const [fileName, csv] = mocks.downloadCsv.mock.calls[0] as [string, string];
    expect(fileName).toMatch(/^warungkasir-menu-\d{8}\.csv$/);
    expect(csv).toBe('"name"\r\n"products"\r\n');
    expect(await screen.findByText('Menu diunduh (1 baris).')).toBeTruthy();
  });

  it('disables every export while one is running', async () => {
    let finish: (value: unknown) => void = () => {};
    mocks.loads.set('transactions', () => new Promise((resolve) => (finish = resolve)));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'UNDUH CSV Export Transaksi' }));
    expect(await screen.findByText('MENYIAPKAN…')).toBeTruthy();
    for (const button of screen.getAllByRole('button')) {
      if (/UNDUH|BACKUP/.test(button.textContent ?? '')) expect((button as HTMLButtonElement).disabled).toBe(true);
    }
    finish(table('t'));
    await waitFor(() => expect(mocks.downloadCsv).toHaveBeenCalledTimes(1));
  });

  it('Backup Data downloads all six files', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /BACKUP DATA/ }));
    await waitFor(() => expect(mocks.downloadCsv).toHaveBeenCalledTimes(6), { timeout: 5000 });
    const names = mocks.downloadCsv.mock.calls.map(([name]) => String(name).replace(/-\d{8}\.csv$/, ''));
    expect(names.sort()).toEqual(
      ['item-transaksi', 'karyawan', 'kategori', 'menu', 'transaksi', 'warung'].map((slug) => `warungkasir-${slug}`),
    );
    expect(await screen.findByText('Backup selesai: 6 file CSV diunduh.')).toBeTruthy();
  });

  it('downloads nothing from Backup Data when one table fails, and explains', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.loads.set('profiles', () => Promise.reject(new Error('timeout')));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /BACKUP DATA/ }));
    expect(await screen.findByText(/Export gagal/)).toBeTruthy();
    expect(mocks.downloadCsv).not.toHaveBeenCalled();
  });
});

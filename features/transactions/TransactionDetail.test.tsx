// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '@/features/auth/account';
import { enqueueTransaction, markNotSynced, markSynced } from '@/features/offline/outbox';
import { resetIndexedDb } from '@/lib/test-support/fakeIndexedDb';
import { testSnapshot } from '@/lib/test-support/transactions';
import { TransactionDetail } from './TransactionDetail';
import type { TransactionDetail as TransactionDetailData } from './model';

const cashier: Profile = { id: 'cashier-1', storeId: 'store-a', name: 'Andi', role: 'cashier' };
const owner: Profile = { id: 'owner-1', storeId: 'store-a', name: 'Bu Sari', role: 'owner' };

const mocks = vi.hoisted(() => ({
  profile: null as unknown as Profile,
  searchParams: new URLSearchParams(),
  getTransaction: vi.fn(),
}));

vi.mock('@/features/auth/AuthProvider', () => ({ useProfile: () => mocks.profile }));
vi.mock('next/navigation', () => ({ useSearchParams: () => mocks.searchParams }));
vi.mock('./api', () => ({ getTransaction: mocks.getTransaction }));

const ID = testSnapshot().id;

function serverDetail(overrides: Partial<TransactionDetailData> = {}): TransactionDetailData {
  return {
    id: ID,
    code: 'TRX-20261007-3F9A2C',
    createdAt: '2026-10-07T03:32:00.123456+00:00',
    total: 40000,
    paidAmount: 50000,
    changeAmount: 10000,
    cashierId: 'cashier-1',
    cashierName: 'Andi',
    itemCount: 4,
    source: 'server',
    serverStatus: 'completed',
    syncStatus: null,
    syncedAt: '2026-10-07T03:32:05+00:00',
    lines: [
      { productName: 'Es Teh', unitPrice: 5000, quantity: 2, subtotal: 10000 },
      { productName: 'Nasi Goreng', unitPrice: 15000, quantity: 2, subtotal: 30000 },
    ],
    ...overrides,
  };
}

function renderDetail(id: string | null = ID) {
  mocks.searchParams = new URLSearchParams(id ? { id } : {});
  return render(<TransactionDetail />);
}

const value = (label: string) => screen.getByText(label, { exact: true }).nextElementSibling?.textContent;

beforeEach(async () => {
  await resetIndexedDb();
  mocks.profile = cashier;
  mocks.getTransaction.mockReset();
  mocks.getTransaction.mockResolvedValue(null);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TransactionDetail — a sale on the server (PRD §20)', () => {
  beforeEach(() => {
    mocks.getTransaction.mockResolvedValue(serverDetail());
  });

  it('shows the code, items as sold, totals, cashier, date and time in WIB', async () => {
    renderDetail();

    expect(await screen.findByText('TRX-20261007-3F9A2C')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Detail Transaksi', level: 1 })).toBeTruthy();

    const items = within(screen.getByRole('list'));
    const rows = items.getAllByRole('listitem').map((row) => row.textContent);
    expect(rows).toEqual(['Es TehRp5.000 × 2Rp10.000', 'Nasi GorengRp15.000 × 2Rp30.000']);

    expect(value('Total')).toBe('Rp40.000');
    expect(value('Bayar')).toBe('Rp50.000');
    expect(value('Kembalian')).toBe('Rp10.000');
    expect(value('Kasir')).toBe('Andi');
    expect(value('Tanggal')).toBe('07/10/2026');
    expect(value('Waktu')).toBe('10:32 WIB');
  });

  it('shows the server status and the sync state as separate text badges', async () => {
    renderDetail();

    await screen.findByText('TRX-20261007-3F9A2C');
    expect(screen.getByText('Selesai')).toBeTruthy();
    expect(screen.getByText('Tersinkron')).toBeTruthy();
    expect(screen.queryByText('Belum tersinkron')).toBeNull();
  });

  it('shows a cancelled sale as "Dibatalkan"', async () => {
    mocks.getTransaction.mockResolvedValue(serverDetail({ serverStatus: 'cancelled' }));

    renderDetail();

    expect(await screen.findByText('Dibatalkan')).toBeTruthy();
  });

  it('uses the price recorded at the sale, not anything from the catalog', async () => {
    // The row says Rp15.000; whatever Nasi Goreng costs today, the detail only knows the snapshot.
    renderDetail();

    expect(await screen.findByText('Rp15.000 × 2')).toBeTruthy();
    expect(mocks.getTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.getTransaction).toHaveBeenCalledWith(ID);
  });

  it('shows the time in WIB when the device is in another timezone', async () => {
    mocks.getTransaction.mockResolvedValue(serverDetail({ createdAt: '2026-10-07T17:30:00+00:00' }));

    renderDetail();

    await screen.findByText('TRX-20261007-3F9A2C');
    expect(value('Tanggal')).toBe('08/10/2026');
    expect(value('Waktu')).toBe('00:30 WIB');
  });

  it('goes back to the history list', async () => {
    renderDetail();
    await screen.findByText('TRX-20261007-3F9A2C');

    expect(screen.getByRole('link', { name: 'Kembali ke riwayat' }).getAttribute('href')).toBe('/riwayat');
  });

  it('prefers the server row over the device copy', async () => {
    await enqueueTransaction(testSnapshot());
    await markSynced(ID);

    renderDetail();

    await screen.findByText('TRX-20261007-3F9A2C');
    expect(screen.getByText('Selesai')).toBeTruthy();
    expect(screen.getByText('Tersinkron')).toBeTruthy();
  });
});

describe('TransactionDetail — a sale only on this device', () => {
  it('opens a pending sale from its local snapshot, without the server row', async () => {
    await enqueueTransaction(testSnapshot());

    renderDetail();

    expect(await screen.findByText('TRX-20261007-3F9A2C')).toBeTruthy();
    expect(value('Total')).toBe('Rp40.000');
    expect(value('Bayar')).toBe('Rp50.000');
    expect(value('Kembalian')).toBe('Rp10.000');
    expect(value('Kasir')).toBe('Andi');
    // The original sale time is kept; no server timestamp is invented.
    expect(value('Tanggal')).toBe('07/10/2026');
    expect(value('Waktu')).toBe('10:32 WIB');
    expect(within(screen.getByRole('list')).getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'Es TehRp5.000 × 2Rp10.000',
      'Nasi GorengRp15.000 × 2Rp30.000',
    ]);
  });

  it('marks a pending sale "Belum tersinkron" and explains it; it has no server status yet', async () => {
    await enqueueTransaction(testSnapshot());

    renderDetail();

    await screen.findByText('TRX-20261007-3F9A2C');
    expect(screen.getByText('Belum tersinkron')).toBeTruthy();
    expect(screen.getByText(/belum diterima server/)).toBeTruthy();
    expect(screen.queryByText('Selesai')).toBeNull();
    expect(screen.queryByText('Tersinkron')).toBeNull();
  });

  it('marks a rejected sale "Gagal sinkron" and says it is kept on the device', async () => {
    await enqueueTransaction(testSnapshot());
    await markNotSynced(ID, 'failed', 'WK002: inactive');

    renderDetail();

    await screen.findByText('TRX-20261007-3F9A2C');
    expect(screen.getByText('Gagal sinkron')).toBeTruthy();
    expect(screen.getByText(/Server menolak transaksi ini/)).toBeTruthy();
  });

  it('still opens the sale when the server cannot be reached (offline)', async () => {
    await enqueueTransaction(testSnapshot());
    mocks.getTransaction.mockRejectedValue(new Error('offline'));

    renderDetail();

    expect(await screen.findByText('TRX-20261007-3F9A2C')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Transaksi gagal dimuat' })).toBeNull();
  });

  it('shows a synced device copy while the server row is not readable yet', async () => {
    await enqueueTransaction(testSnapshot());
    await markSynced(ID);

    renderDetail();

    await screen.findByText('TRX-20261007-3F9A2C');
    expect(screen.getByText('Tersinkron')).toBeTruthy();
  });
});

describe('TransactionDetail — missing, foreign, and failed', () => {
  it('says "not found" when neither the server nor the device has the sale', async () => {
    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Transaksi tidak ditemukan' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'KEMBALI KE RIWAYAT' }).getAttribute('href')).toBe('/riwayat');
  });

  it('does not show another cashier’s sale kept on the same device', async () => {
    await enqueueTransaction(testSnapshot({ cashier_id: 'cashier-2' }));

    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Transaksi tidak ditemukan' })).toBeTruthy();
    expect(screen.queryByText('TRX-20261007-3F9A2C')).toBeNull();
  });

  it('does not show a sale of another store', async () => {
    await enqueueTransaction(testSnapshot({ store_id: 'store-b' }));

    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Transaksi tidak ditemukan' })).toBeTruthy();
  });

  it('does not ask the server about an id that is not a UUID', async () => {
    renderDetail('not-a-uuid');

    expect(await screen.findByRole('heading', { name: 'Transaksi tidak ditemukan' })).toBeTruthy();
    expect(mocks.getTransaction).not.toHaveBeenCalled();
  });

  it('explains a missing id', async () => {
    renderDetail(null);

    expect(await screen.findByRole('heading', { name: 'Transaksi tidak ditemukan' })).toBeTruthy();
    expect(mocks.getTransaction).not.toHaveBeenCalled();
  });

  it('when the server cannot be reached and nothing is saved here, shows an error with a retry', async () => {
    mocks.getTransaction.mockRejectedValueOnce(new Error('offline'));

    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Transaksi gagal dimuat' })).toBeTruthy();

    mocks.getTransaction.mockResolvedValue(serverDetail());
    fireEvent.click(screen.getByRole('button', { name: 'COBA LAGI' }));

    expect(await screen.findByText('TRX-20261007-3F9A2C')).toBeTruthy();
  });

  it('shows a loading state first, never a blank page', () => {
    mocks.getTransaction.mockReturnValue(new Promise(() => {}));

    renderDetail();

    expect(screen.getByRole('status', { name: 'Memuat transaksi' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Detail Transaksi' })).toBeTruthy();
  });

  it('wraps a very long product name instead of overflowing', async () => {
    const longName = 'Nasi Goreng Spesial Ekstra Pedas Dengan Telur Ceplok Ayam Suwir Dan Kerupuk Udang Besar';
    mocks.getTransaction.mockResolvedValue(
      serverDetail({ lines: [{ productName: longName, unitPrice: 15000, quantity: 1, subtotal: 15000 }] }),
    );

    renderDetail();

    const name = await screen.findByText(longName);
    expect(name.className).toContain('break-words');
    await waitFor(() => expect(screen.getByText('Rp15.000 × 1')).toBeTruthy());
  });
});

describe('TransactionDetail — sale time check (SEC-06)', () => {
  it('the owner sees when the server received the sale', async () => {
    mocks.profile = owner;
    mocks.getTransaction.mockResolvedValue(serverDetail());
    renderDetail();

    await screen.findByText('TRX-20261007-3F9A2C');
    expect(value('Diterima server')).toBe('07/10/2026 10:32 WIB');
    expect(screen.queryByText(/Cek waktu/)).toBeNull();
  });

  it('the owner gets the reason for a sale received more than 24 hours late; the sale time is unchanged', async () => {
    mocks.profile = owner;
    mocks.getTransaction.mockResolvedValue(serverDetail({ syncedAt: '2026-10-09T05:00:00+00:00' }));
    renderDetail();

    expect(await screen.findByText(/Diterima server lebih dari 24 jam setelah waktu penjualan/)).toBeTruthy();
    expect(value('Waktu')).toBe('10:32 WIB');
    expect(value('Diterima server')).toBe('09/10/2026 12:00 WIB');
  });

  it('the cashier sees neither the server time nor the check', async () => {
    mocks.profile = cashier;
    mocks.getTransaction.mockResolvedValue(serverDetail({ syncedAt: '2026-10-09T05:00:00+00:00' }));
    renderDetail();

    await screen.findByText('TRX-20261007-3F9A2C');
    expect(screen.queryByText('Diterima server')).toBeNull();
    expect(screen.queryByText(/Cek waktu/)).toBeNull();
  });
});

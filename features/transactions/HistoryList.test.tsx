// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '@/features/auth/account';
import { enqueueTransaction, markNotSynced, markSynced } from '@/features/offline/outbox';
import { resetIndexedDb } from '@/lib/test-support/fakeIndexedDb';
import { testSnapshot } from '@/lib/test-support/transactions';
import type { HistoryPage } from './api';
import { HistoryList } from './HistoryList';
import type { HistoryEntry } from './model';

const owner: Profile = { id: 'owner-1', storeId: 'store-a', name: 'Bu Sari', role: 'owner' };
const cashier: Profile = { id: 'cashier-1', storeId: 'store-a', name: 'Andi', role: 'cashier' };

const mocks = vi.hoisted(() => ({
  profile: null as unknown as Profile,
  listTransactions: vi.fn(),
}));

vi.mock('@/features/auth/AuthProvider', () => ({ useProfile: () => mocks.profile }));
vi.mock('./api', () => ({ listTransactions: mocks.listTransactions }));

const A = '3f9a2c4e-7b1d-4c2a-9e10-000000000001';
const B = '8c41e07a-2d3f-4b6e-8a21-000000000002';
const C = 'c5d6e7f8-1a2b-4c3d-8e4f-000000000003';

function serverEntry(id: string, createdAt: string, overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id,
    code: `TRX-20261007-${id.slice(0, 6).toUpperCase()}`,
    createdAt,
    total: 40000,
    paidAmount: 50000,
    changeAmount: 10000,
    cashierId: 'cashier-1',
    cashierName: 'Andi',
    itemCount: 4,
    source: 'server',
    serverStatus: 'completed',
    syncStatus: null,
    ...overrides,
  };
}

const page = (entries: HistoryEntry[], next: HistoryPage['next'] = null): HistoryPage => ({ entries, next });

/** A sale saved on this device. Defaults to the golden sale: Rp40.000 at 10:32 WIB on 7 Oct 2026. */
async function saveLocal(id: string, createdAt = '2026-10-07T03:32:00.000Z', cashierId = 'cashier-1', storeId = 'store-a') {
  const base = testSnapshot();
  await enqueueTransaction({
    ...base,
    id,
    code: `TRX-20261007-${id.slice(0, 6).toUpperCase()}`,
    created_at: createdAt,
    cashier_id: cashierId,
    store_id: storeId,
  });
}

const cards = () => screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/riwayat/detail'));
const codeOf = (card: HTMLElement) => card.textContent?.match(/TRX-\d{8}-[0-9A-F]{6}/)?.[0];
const lastQuery = () => mocks.listTransactions.mock.calls.at(-1)?.[0] as Parameters<typeof mocks.listTransactions>[0];

beforeEach(async () => {
  await resetIndexedDb();
  mocks.profile = cashier;
  mocks.listTransactions.mockReset();
  mocks.listTransactions.mockResolvedValue(page([]));
  // Only Date is faked: "today" is 7 Oct 2026 in Jakarta, while timers and promises stay real.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T12:00:00+07:00'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('HistoryList — server transactions', () => {
  it('shows a skeleton while loading, then the cards grouped by WIB day', async () => {
    mocks.listTransactions.mockResolvedValue(page([serverEntry(A, '2026-10-07T03:32:00.000Z')]));

    render(<HistoryList />);

    expect(screen.getByRole('status', { name: 'Memuat riwayat' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Rabu, 7 Okt 2026', level: 2 })).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Memuat riwayat' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Riwayat', level: 1 })).toBeTruthy();
  });

  it('a card shows code, WIB time, unit count, total and cashier, and opens the detail by UUID', async () => {
    mocks.listTransactions.mockResolvedValue(page([serverEntry(A, '2026-10-07T03:32:00.000Z')]));

    render(<HistoryList />);

    const card = await screen.findByRole('link', { name: /TRX-20261007-3F9A2C/ });
    expect(card.textContent).toContain('TRX-20261007-3F9A2C');
    expect(card.textContent).toContain('10:32 • 4 item');
    expect(card.textContent).toContain('Rp40.000');
    expect(card.textContent).toContain('Kasir: Andi');
    expect(card.getAttribute('href')).toBe(`/riwayat/detail?id=${A}`);
    // A sale the server has needs no badge.
    expect(card.textContent).not.toContain('sinkron');
  });

  it('shows the time in WIB whatever the device timezone', async () => {
    mocks.listTransactions.mockResolvedValue(
      page([serverEntry(A, '2026-10-07T17:30:00.000Z'), serverEntry(B, '2026-10-07T16:59:00.000Z')]),
    );

    render(<HistoryList />);

    // 17:30Z is 00:30 WIB on 8 Oct; 16:59Z is 23:59 WIB on 7 Oct.
    expect(await screen.findByRole('heading', { name: 'Kamis, 8 Okt 2026' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Rabu, 7 Okt 2026' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /3F9A2C/ }).textContent).toContain('00:30');
    expect(screen.getByRole('link', { name: /8C41E0/ }).textContent).toContain('23:59');
  });

  it('shows a cancelled sale with a text badge', async () => {
    mocks.listTransactions.mockResolvedValue(page([serverEntry(A, '2026-10-07T03:32:00.000Z', { serverStatus: 'cancelled' })]));

    render(<HistoryList />);

    expect((await screen.findByRole('link', { name: /3F9A2C/ })).textContent).toContain('Dibatalkan');
  });
});

describe('HistoryList — owner and cashier scope (D1)', () => {
  it('a cashier asks the server for their own sales only', async () => {
    mocks.profile = cashier;
    render(<HistoryList />);
    await waitFor(() => expect(mocks.listTransactions).toHaveBeenCalled());

    expect(lastQuery()).toMatchObject({ cashierId: 'cashier-1', after: null });
  });

  it('an owner asks for the whole store: no cashier filter', async () => {
    mocks.profile = owner;
    mocks.listTransactions.mockResolvedValue(
      page([
        serverEntry(A, '2026-10-07T03:32:00.000Z', { cashierName: 'Andi' }),
        serverEntry(B, '2026-10-07T05:05:00.000Z', { cashierId: 'cashier-2', cashierName: 'Budi' }),
      ]),
    );

    render(<HistoryList />);

    expect(await screen.findByRole('link', { name: /Kasir: Budi/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Kasir: Andi/ })).toBeTruthy();
    expect(lastQuery().cashierId).toBeNull();
  });

  it('never shows another cashier’s sale saved on the same device', async () => {
    await saveLocal(C, '2026-10-07T03:32:00.000Z', 'cashier-2');

    render(<HistoryList />);

    expect(await screen.findByRole('heading', { name: 'Belum ada transaksi' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /C5D6E7/ })).toBeNull();
  });
});

describe('HistoryList — merging this device’s sales', () => {
  it('does not show a sale saved for another store on the same device', async () => {
    await saveLocal(C, '2026-10-07T03:32:00.000Z', 'cashier-1', 'store-b');

    render(<HistoryList />);

    expect(await screen.findByRole('heading', { name: 'Belum ada transaksi' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /C5D6E7/ })).toBeNull();
  });

  it('shows a pending local sale the server does not have, with the "Belum tersinkron" badge', async () => {
    await saveLocal(A);

    render(<HistoryList />);

    const card = await screen.findByRole('link', { name: /TRX-20261007-3F9A2C/ });
    expect(card.textContent).toContain('Belum tersinkron');
    expect(card.textContent).toContain('Rp40.000');
    expect(card.textContent).toContain('10:32 • 4 item');
    expect(card.textContent).toContain('Kasir: Andi');
    expect(card.getAttribute('href')).toBe(`/riwayat/detail?id=${A}`);
  });

  it('puts a pending sale among the server rows by sale time', async () => {
    await saveLocal(B, '2026-10-07T05:00:00.000Z');
    mocks.listTransactions.mockResolvedValue(
      page([serverEntry(C, '2026-10-07T08:00:00.000Z'), serverEntry(A, '2026-10-07T03:00:00.000Z')]),
    );

    render(<HistoryList />);

    await screen.findByRole('link', { name: /8C41E0/ });
    expect(cards().map(codeOf)).toEqual([
      'TRX-20261007-C5D6E7',
      'TRX-20261007-8C41E0',
      'TRX-20261007-3F9A2C',
    ]);
  });

  it('shows a failed sale as "Gagal sinkron" and keeps it', async () => {
    await saveLocal(A);
    await markNotSynced(A, 'failed', 'WK002: inactive');

    render(<HistoryList />);

    expect((await screen.findByRole('link', { name: /3F9A2C/ })).textContent).toContain('Gagal sinkron');
  });

  it('converges to the server row after sync: one card, no badge, and no duplicate', async () => {
    await saveLocal(A);
    const first = render(<HistoryList />);
    expect((await screen.findByRole('link', { name: /3F9A2C/ })).textContent).toContain('Belum tersinkron');
    first.unmount();

    // The sale synced: the outbox says synced, and the server now returns the same UUID.
    await markSynced(A);
    mocks.listTransactions.mockResolvedValue(page([serverEntry(A, '2026-10-07T03:32:00.000Z')]));
    render(<HistoryList />);

    const card = await screen.findByRole('link', { name: /3F9A2C/ });
    expect(cards()).toHaveLength(1);
    expect(card.textContent).not.toContain('sinkron');
  });

  it('a synced local copy that the server list has not caught up with is shown once, without a badge', async () => {
    await saveLocal(A);
    await markSynced(A);

    render(<HistoryList />);

    const card = await screen.findByRole('link', { name: /3F9A2C/ });
    expect(cards()).toHaveLength(1);
    expect(card.textContent).not.toContain('Belum tersinkron');
  });

  it('still shows this device’s sales when the server cannot be reached, with a retry', async () => {
    await saveLocal(A);
    mocks.listTransactions.mockRejectedValue(new Error('offline'));

    render(<HistoryList />);

    expect(await screen.findByRole('link', { name: /3F9A2C/ })).toBeTruthy();
    expect(screen.getByText(/Riwayat dari server tidak dapat dimuat/)).toBeTruthy();

    mocks.listTransactions.mockResolvedValue(page([serverEntry(A, '2026-10-07T03:32:00.000Z'), serverEntry(B, '2026-10-07T05:05:00.000Z')]));
    fireEvent.click(screen.getByRole('button', { name: 'COBA LAGI' }));

    await waitFor(() => expect(cards()).toHaveLength(2));
    expect(screen.queryByText(/Riwayat dari server tidak dapat dimuat/)).toBeNull();
  });
});

describe('HistoryList — search by code', () => {
  it('searches the display code after a pause in typing', async () => {
    render(<HistoryList />);
    await waitFor(() => expect(mocks.listTransactions).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByRole('searchbox', { name: 'Cari kode transaksi' }), { target: { value: '3f9a' } });

    await waitFor(() => expect(lastQuery().search).toBe('3f9a'));
    // One request for the finished word, not one per letter.
    expect(mocks.listTransactions).toHaveBeenCalledTimes(2);
  });

  it('removes characters that cannot be in a code before searching', async () => {
    render(<HistoryList />);
    await waitFor(() => expect(mocks.listTransactions).toHaveBeenCalled());

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: ' 50%,_x ' } });

    await waitFor(() => expect(lastQuery().search).toBe('50x'));
  });

  it('filters this device’s sales by code too', async () => {
    await saveLocal(A);
    await saveLocal(B, '2026-10-07T05:05:00.000Z');
    render(<HistoryList />);
    await waitFor(() => expect(cards()).toHaveLength(2));

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '8c41' } });

    await waitFor(() => expect(cards()).toHaveLength(1));
    expect(cards()[0]?.textContent).toContain('TRX-20261007-8C41E0');
  });

  it('does not match on the internal UUID', async () => {
    await saveLocal(A);
    render(<HistoryList />);
    await waitFor(() => expect(cards()).toHaveLength(1));

    // 7b1d is inside the UUID but not inside the display code.
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '7b1d' } });

    expect(await screen.findByRole('heading', { name: 'Transaksi tidak ditemukan' })).toBeTruthy();
  });

  it('explains an empty search and clears it', async () => {
    render(<HistoryList />);
    await waitFor(() => expect(mocks.listTransactions).toHaveBeenCalled());

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });

    expect(await screen.findByRole('heading', { name: 'Transaksi tidak ditemukan' })).toBeTruthy();
    expect(screen.getByText('Tidak ada transaksi dengan kode "zzz" hari ini.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'HAPUS PENCARIAN' }));

    await waitFor(() => expect(lastQuery().search).toBe(''));
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  });
});

describe('HistoryList — date filter and order', () => {
  it('starts on "Hari Ini": the Asia/Jakarta day, newest first', async () => {
    render(<HistoryList />);
    await waitFor(() => expect(mocks.listTransactions).toHaveBeenCalled());

    expect((screen.getByRole('combobox', { name: 'Filter tanggal' }) as HTMLSelectElement).value).toBe('today');
    expect(lastQuery()).toMatchObject({
      range: { from: '2026-10-06T17:00:00.000Z', to: '2026-10-07T17:00:00.000Z' },
      order: 'newest',
    });
  });

  it('offers the date choices and queries the chosen window', async () => {
    render(<HistoryList />);
    await waitFor(() => expect(mocks.listTransactions).toHaveBeenCalled());
    const select = screen.getByRole('combobox', { name: 'Filter tanggal' });
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Hari Ini',
      'Kemarin',
      '7 Hari Terakhir',
      '30 Hari Terakhir',
      'Semua Tanggal',
    ]);

    fireEvent.change(select, { target: { value: 'yesterday' } });
    await waitFor(() =>
      expect(lastQuery().range).toEqual({ from: '2026-10-05T17:00:00.000Z', to: '2026-10-06T17:00:00.000Z' }),
    );

    fireEvent.change(select, { target: { value: 'all' } });
    await waitFor(() => expect(lastQuery().range).toEqual({ from: null, to: null }));
  });

  it('hides this device’s sales outside the chosen day', async () => {
    await saveLocal(A, '2026-10-07T03:32:00.000Z');
    await saveLocal(B, '2026-10-05T03:32:00.000Z');
    render(<HistoryList />);

    await waitFor(() => expect(cards()).toHaveLength(1));
    expect(cards()[0]?.textContent).toContain('3F9A2C');

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter tanggal' }), { target: { value: 'all' } });
    await waitFor(() => expect(cards()).toHaveLength(2));
  });

  it('sorts oldest first when chosen', async () => {
    await saveLocal(A, '2026-10-07T03:00:00.000Z');
    await saveLocal(B, '2026-10-07T05:00:00.000Z');
    render(<HistoryList />);
    await waitFor(() => expect(cards()).toHaveLength(2));
    expect(cards()[0]?.textContent).toContain('8C41E0');

    fireEvent.change(screen.getByRole('combobox', { name: 'Urutan' }), { target: { value: 'oldest' } });

    await waitFor(() => expect(lastQuery().order).toBe('oldest'));
    await waitFor(() => expect(cards()[0]?.textContent).toContain('3F9A2C'));
  });

  it('shows "Belum ada transaksi hari ini" with a way to see every date', async () => {
    render(<HistoryList />);

    expect(await screen.findByText('Belum ada transaksi hari ini.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'TAMPILKAN SEMUA TANGGAL' }));

    await waitFor(() => expect(lastQuery().range).toEqual({ from: null, to: null }));
    expect(await screen.findByText('Transaksi yang disimpan akan muncul di sini.')).toBeTruthy();
  });
});

describe('HistoryList — paging', () => {
  const t = (minute: number) => `2026-10-07T03:${String(minute).padStart(2, '0')}:00.000Z`;
  const firstPage = page([serverEntry(A, t(50)), serverEntry(B, t(40))], { createdAt: t(40), id: B });

  it('loads the next page from the cursor and appends it, with no repeated rows', async () => {
    mocks.listTransactions.mockResolvedValueOnce(firstPage);
    render(<HistoryList />);
    await waitFor(() => expect(cards()).toHaveLength(2));

    // A buggy server answer that repeats a row must not duplicate it on screen.
    mocks.listTransactions.mockResolvedValueOnce(page([serverEntry(B, t(40)), serverEntry(C, t(30))]));
    fireEvent.click(screen.getByRole('button', { name: 'MUAT LEBIH BANYAK' }));

    await waitFor(() => expect(cards()).toHaveLength(3));
    expect(lastQuery().after).toEqual({ createdAt: t(40), id: B });
    expect(cards().map(codeOf)).toEqual(['TRX-20261007-3F9A2C', 'TRX-20261007-8C41E0', 'TRX-20261007-C5D6E7']);
    // No more pages: the button is gone.
    expect(screen.queryByRole('button', { name: /MUAT LEBIH BANYAK|MEMUAT/ })).toBeNull();
  });

  it('keeps the same filters for every page of a query', async () => {
    mocks.listTransactions.mockResolvedValueOnce(firstPage);
    render(<HistoryList />);
    await waitFor(() => expect(cards()).toHaveLength(2));
    const firstQuery = mocks.listTransactions.mock.calls[0]?.[0];

    mocks.listTransactions.mockResolvedValueOnce(page([]));
    fireEvent.click(screen.getByRole('button', { name: 'MUAT LEBIH BANYAK' }));
    await waitFor(() => expect(mocks.listTransactions).toHaveBeenCalledTimes(2));

    expect(lastQuery()).toMatchObject({ range: firstQuery.range, order: firstQuery.order, search: firstQuery.search, cashierId: 'cashier-1' });
  });

  it('shows no "load more" button when there is a single page', async () => {
    mocks.listTransactions.mockResolvedValue(page([serverEntry(A, t(50))]));
    render(<HistoryList />);
    await screen.findByRole('link', { name: /3F9A2C/ });

    expect(screen.queryByRole('button', { name: 'MUAT LEBIH BANYAK' })).toBeNull();
  });

  it('disables the button while loading, so a double tap loads one page', async () => {
    mocks.listTransactions.mockResolvedValueOnce(firstPage);
    render(<HistoryList />);
    await waitFor(() => expect(cards()).toHaveLength(2));

    let release: (value: HistoryPage) => void = () => {};
    mocks.listTransactions.mockReturnValueOnce(new Promise<HistoryPage>((resolve) => (release = resolve)));
    const button = screen.getByRole('button', { name: 'MUAT LEBIH BANYAK' });
    fireEvent.click(button);
    fireEvent.click(button);

    const loading = await screen.findByRole('button', { name: 'MEMUAT…' });
    expect((loading as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.listTransactions).toHaveBeenCalledTimes(2);

    release(page([serverEntry(C, t(30))]));
    await waitFor(() => expect(cards()).toHaveLength(3));
  });

  it('a failed page keeps the rows already shown and offers a retry from the same cursor', async () => {
    mocks.listTransactions.mockResolvedValueOnce(firstPage);
    render(<HistoryList />);
    await waitFor(() => expect(cards()).toHaveLength(2));

    mocks.listTransactions.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'MUAT LEBIH BANYAK' }));

    expect(await screen.findByText(/Transaksi berikutnya gagal dimuat/)).toBeTruthy();
    expect(cards()).toHaveLength(2);

    mocks.listTransactions.mockResolvedValueOnce(page([serverEntry(C, t(30))]));
    fireEvent.click(screen.getByRole('button', { name: 'COBA LAGI' }));

    await waitFor(() => expect(cards()).toHaveLength(3));
    expect(lastQuery().after).toEqual({ createdAt: t(40), id: B });
  });

  it('a new filter starts again from the first page', async () => {
    mocks.listTransactions.mockResolvedValueOnce(firstPage);
    render(<HistoryList />);
    await waitFor(() => expect(cards()).toHaveLength(2));

    mocks.listTransactions.mockResolvedValue(page([serverEntry(C, t(30))]));
    fireEvent.change(screen.getByRole('combobox', { name: 'Urutan' }), { target: { value: 'oldest' } });

    await waitFor(() => expect(cards()).toHaveLength(1));
    expect(lastQuery().after).toBeNull();
  });
});

describe('HistoryList — states', () => {
  it('shows an error with a retry when the server cannot be reached and nothing is saved here', async () => {
    mocks.listTransactions.mockRejectedValueOnce(new Error('offline'));

    render(<HistoryList />);

    expect(await screen.findByRole('heading', { name: 'Riwayat gagal dimuat' })).toBeTruthy();

    mocks.listTransactions.mockResolvedValue(page([serverEntry(A, '2026-10-07T03:32:00.000Z')]));
    fireEvent.click(screen.getByRole('button', { name: 'COBA LAGI' }));

    expect(await screen.findByRole('link', { name: /3F9A2C/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Riwayat gagal dimuat' })).toBeNull();
  });

  it('survives an unreadable device store: the server history still shows', async () => {
    mocks.listTransactions.mockResolvedValue(page([serverEntry(A, '2026-10-07T03:32:00.000Z')]));
    const original = globalThis.indexedDB;
    // @ts-expect-error simulate a browser without IndexedDB (e.g. blocked storage)
    globalThis.indexedDB = undefined;
    try {
      render(<HistoryList />);
      expect(await screen.findByRole('link', { name: /3F9A2C/ })).toBeTruthy();
    } finally {
      globalThis.indexedDB = original;
    }
  });
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetIndexedDb } from '@/lib/test-support/fakeIndexedDb';
import { testSnapshot } from '@/lib/test-support/transactions';
import { enqueueTransaction, getOutboxEntry, markNotSynced } from './outbox';
import { describeSync, SyncIndicator, SyncStatusPanel } from './SyncStatus';
import { syncManager } from './syncManager';

const mocks = vi.hoisted(() => ({ syncOnce: vi.fn() }));

vi.mock('./sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sync')>()),
  syncOnce: mocks.syncOnce,
}));

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

beforeEach(async () => {
  await resetIndexedDb();
  mocks.syncOnce.mockReset().mockResolvedValue({ synced: 0, pending: 0, failed: 0 });
  setOnline(true);
});

afterEach(() => {
  cleanup();
  syncManager.setCashier(null);
});

describe('describeSync', () => {
  it('everything synced', () => {
    expect(describeSync({ pending: 0, failed: 0, running: false }, true)).toMatchObject({
      tone: 'success',
      label: 'Semua tersinkron',
      canRetry: false,
    });
  });

  it('pending while online: will retry by itself, manual retry allowed', () => {
    expect(describeSync({ pending: 3, failed: 0, running: false }, true)).toEqual({
      tone: 'warning',
      label: '3 belum tersinkron',
      detail: 'Transaksi tersimpan di perangkat. Sinkronisasi akan dicoba kembali.',
      canRetry: true,
    });
  });

  it('pending while offline: explains the network, no pointless retry button', () => {
    expect(describeSync({ pending: 2, failed: 0, running: false }, false)).toMatchObject({
      label: '2 belum tersinkron',
      detail: expect.stringContaining('Koneksi internet tidak tersedia'),
      canRetry: false,
    });
  });

  it('failed comes first and always offers Coba Lagi; says nothing is deleted', () => {
    const summary = describeSync({ pending: 1, failed: 2, running: false }, false);
    expect(summary).toMatchObject({ tone: 'danger', label: '2 gagal sinkron', canRetry: true });
    expect(summary.detail).toContain('tidak dihapus');
    expect(summary.detail).toContain('1 transaksi lain menunggu');
  });

  it('while sending', () => {
    expect(describeSync({ pending: 1, failed: 0, running: true }, true)).toMatchObject({ label: 'Menyinkronkan…', canRetry: false });
  });
});

describe('SyncStatusPanel (Lainnya, UI_SPEC A.24)', () => {
  it('shows the counts of the signed-in user and Coba Lagi resends failed sales (same UUID)', async () => {
    await enqueueTransaction(testSnapshot({ id: 'f1' }));
    await markNotSynced('f1', 'failed', 'WK002: inactive');
    mocks.syncOnce.mockImplementation(async () => {
      // The failed sale is back to pending when the pass runs.
      expect((await getOutboxEntry('f1'))?.sync_status).toBe('pending');
      await markNotSynced('f1', 'failed', 'WK002: inactive');
      return { synced: 0, pending: 0, failed: 1 };
    });
    act(() => syncManager.setCashier('cashier-1'));
    render(<SyncStatusPanel />);

    expect(await screen.findByText('1 gagal sinkron')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'COBA LAGI' }));

    await waitFor(() => expect(mocks.syncOnce).toHaveBeenCalledWith('cashier-1'));
    expect(await getOutboxEntry('f1')).toBeDefined();
  });

  it('says so when everything is synced', async () => {
    act(() => syncManager.setCashier('cashier-1'));
    render(<SyncStatusPanel />);

    expect(await screen.findByText('Semua tersinkron')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'COBA LAGI' })).toBeNull();
  });

  it('shows the offline state', async () => {
    setOnline(false);
    await enqueueTransaction(testSnapshot());
    act(() => syncManager.setCashier('cashier-1'));
    render(<SyncStatusPanel />);

    expect(await screen.findByText('1 belum tersinkron')).toBeTruthy();
    expect(screen.getByText('Perangkat sedang offline.')).toBeTruthy();
  });
});

describe('SyncIndicator (header)', () => {
  it('shows nothing on a normal online day with everything synced', async () => {
    act(() => syncManager.setCashier('cashier-1'));
    const { container } = render(<SyncIndicator />);
    await waitFor(() => expect(syncManager.getSnapshot().version).toBeGreaterThan(0));

    expect(container.textContent).toBe('');
  });

  it('shows Offline and the pending count, and follows online/offline events', async () => {
    setOnline(false);
    await enqueueTransaction(testSnapshot());
    act(() => syncManager.setCashier('cashier-1'));
    render(<SyncIndicator />);

    expect(await screen.findByText('1 belum tersinkron')).toBeTruthy();
    expect(screen.getByText('Offline')).toBeTruthy();

    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByText('Offline')).toBeNull();
    expect(screen.getByText('1 belum tersinkron')).toBeTruthy();
  });
});

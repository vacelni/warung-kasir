// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { countUnsynced, enqueueTransaction, getOutboxEntry, markNotSynced, markSynced } from '@/features/offline/outbox';
import { resetIndexedDb } from '@/lib/test-support/fakeIndexedDb';
import { testSnapshot } from '@/lib/test-support/transactions';
import type { Profile } from './account';
import { LogoutButton } from './LogoutButton';

const cashier: Profile = { id: 'cashier-1', storeId: 'store-a', name: 'Andi', role: 'cashier' };

const mocks = vi.hoisted(() => ({ logout: vi.fn(), request: vi.fn() }));

vi.mock('./AuthProvider', () => ({
  useProfile: () => cashier,
  useAuth: () => ({ logout: mocks.logout }),
}));
vi.mock('@/features/offline/syncManager', () => ({ syncManager: { request: mocks.request } }));

// jsdom does not implement the modal <dialog> methods.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
}

beforeEach(async () => {
  await resetIndexedDb();
  mocks.logout.mockReset().mockResolvedValue(undefined);
  mocks.request.mockReset().mockResolvedValue({});
  setOnline(true);
});

afterEach(cleanup);

async function threeUnsynced() {
  await enqueueTransaction(testSnapshot({ id: 'p1' }));
  await enqueueTransaction(testSnapshot({ id: 'p2' }));
  await enqueueTransaction(testSnapshot({ id: 'f1' }));
  await enqueueTransaction(testSnapshot({ id: 'done' }));
  await enqueueTransaction(testSnapshot({ id: 'other', cashier_id: 'cashier-2' }));
  await markNotSynced('f1', 'failed', 'WK001: rejected');
  await markSynced('done');
}

const keluar = () => screen.getByRole('button', { name: 'Keluar' });

describe('LogoutButton (UI_SPEC A.24)', () => {
  it('logs out at once when nothing is waiting to sync', async () => {
    await enqueueTransaction(testSnapshot({ id: 'done' }));
    await markSynced('done');
    render(<LogoutButton />);

    fireEvent.click(keluar());

    await waitFor(() => expect(mocks.logout).toHaveBeenCalledOnce());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('blocks with the count of this user’s pending and failed sales', async () => {
    await threeUnsynced();
    render(<LogoutButton />);

    fireEvent.click(keluar());

    const dialog = await screen.findByRole('dialog', { name: 'Masih ada 3 transaksi belum tersinkron.' });
    expect(dialog.textContent).toContain('akan disinkronkan saat akun yang sama masuk kembali di perangkat ini');
    // Blocking: no close button; Batal is the default (focused) choice.
    expect(screen.queryByRole('button', { name: 'Tutup' })).toBeNull();
    expect(document.activeElement?.textContent).toBe('BATAL');
    expect(mocks.logout).not.toHaveBeenCalled();
  });

  it('Batal keeps the user in the app and every sale on the device', async () => {
    await threeUnsynced();
    render(<LogoutButton />);
    fireEvent.click(keluar());
    await screen.findByRole('dialog');

    fireEvent.click(screen.getByRole('button', { name: 'BATAL' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mocks.logout).not.toHaveBeenCalled();
    expect(await countUnsynced('cashier-1')).toEqual({ pending: 2, failed: 1 });
  });

  it('Tetap keluar logs out and deletes nothing', async () => {
    await threeUnsynced();
    render(<LogoutButton />);
    fireEvent.click(keluar());
    await screen.findByRole('dialog');

    fireEvent.click(screen.getByRole('button', { name: 'Tetap keluar' }));

    await waitFor(() => expect(mocks.logout).toHaveBeenCalledOnce());
    expect(await countUnsynced('cashier-1')).toEqual({ pending: 2, failed: 1 });
    expect(await getOutboxEntry('other')).toMatchObject({ cashier_id: 'cashier-2', sync_status: 'pending' });
  });

  it('Sinkronkan sekarang: syncs, and logs out once nothing is left', async () => {
    await enqueueTransaction(testSnapshot({ id: 'p1' }));
    mocks.request.mockImplementation(async () => {
      await markSynced('p1');
      return {};
    });
    render(<LogoutButton />);
    fireEvent.click(keluar());
    await screen.findByRole('dialog', { name: 'Masih ada 1 transaksi belum tersinkron.' });

    fireEvent.click(screen.getByRole('button', { name: 'SINKRONKAN SEKARANG' }));

    await waitFor(() => expect(mocks.logout).toHaveBeenCalledOnce());
    expect(mocks.request).toHaveBeenCalledWith('manual');
  });

  it('Sinkronkan sekarang that cannot finish: stays, says so, nothing deleted', async () => {
    await threeUnsynced();
    render(<LogoutButton />);
    fireEvent.click(keluar());
    await screen.findByRole('dialog');

    fireEvent.click(screen.getByRole('button', { name: 'SINKRONKAN SEKARANG' }));

    expect(await screen.findByText(/Sinkronisasi belum berhasil/)).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Masih ada 3 transaksi belum tersinkron.' })).toBeTruthy();
    expect(mocks.logout).not.toHaveBeenCalled();
    expect(await countUnsynced('cashier-1')).toEqual({ pending: 2, failed: 1 });
  });

  it('offline: no Sinkronkan sekarang (it cannot work), Batal and Tetap keluar remain', async () => {
    setOnline(false);
    await threeUnsynced();
    render(<LogoutButton />);
    fireEvent.click(keluar());
    await screen.findByRole('dialog');

    expect(screen.queryByRole('button', { name: 'SINKRONKAN SEKARANG' })).toBeNull();
    expect(screen.getByRole('button', { name: 'BATAL' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tetap keluar' })).toBeTruthy();
    expect(screen.getByText(/Perangkat sedang offline/)).toBeTruthy();
  });
});

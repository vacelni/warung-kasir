// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '@/features/auth/account';
import { readCatalog, saveCatalog } from '@/features/offline/catalogCache';
import { resetIndexedDb } from '@/lib/test-support/fakeIndexedDb';
import type { Catalog } from './api';
import { CartProvider } from './CartProvider';
import { CatalogProvider } from './CatalogProvider';
import { ProductPicker } from './ProductPicker';
import { ToastProvider } from '@/components/ui/Toast';

const cashier: Profile = { id: 'cashier-1', storeId: 'store-a', name: 'Andi', role: 'cashier' };
const mocks = vi.hoisted(() => ({ fetchCatalog: vi.fn() }));

vi.mock('@/features/auth/AuthProvider', () => ({ useProfile: () => cashier }));
vi.mock('./api', () => ({ fetchCatalog: mocks.fetchCatalog }));

const SERVER: Catalog = {
  categories: [{ id: 'makanan', name: 'Makanan' }],
  products: [{ id: 'nasi', name: 'Nasi Goreng', price: 16000, categoryId: 'makanan' }],
};
const CACHED: Catalog = {
  categories: [{ id: 'makanan', name: 'Makanan' }],
  products: [{ id: 'nasi', name: 'Nasi Goreng', price: 15000, categoryId: 'makanan' }],
};
const SAVED_AT = new Date('2026-10-07T03:00:00.000Z'); // 10:00 WIB

beforeEach(async () => {
  await resetIndexedDb();
  mocks.fetchCatalog.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderKasir() {
  return render(
    <ToastProvider>
      <CatalogProvider>
        <CartProvider>
          <ProductPicker />
        </CartProvider>
      </CatalogProvider>
    </ToastProvider>,
  );
}

const offline = () => new Error('TypeError: Failed to fetch');

describe('CatalogProvider offline catalog (TECHNICAL_SPEC C.10)', () => {
  it('online: shows the server menu and saves it on the device for the next offline start', async () => {
    mocks.fetchCatalog.mockResolvedValue(SERVER);
    renderKasir();

    expect(await screen.findByRole('button', { name: /^Nasi Goreng/ })).toBeTruthy();
    await waitFor(async () => expect(await readCatalog('cashier-1', 'store-a')).toMatchObject(SERVER));
    expect(screen.queryByText(/data tersimpan di perangkat/)).toBeNull();
  });

  it('offline: sells from the device copy, with its (possibly old) prices, and says so', async () => {
    await saveCatalog('cashier-1', 'store-a', CACHED, SAVED_AT);
    mocks.fetchCatalog.mockRejectedValue(offline());
    renderKasir();

    const card = await screen.findByRole('button', { name: /^Nasi Goreng/ });
    expect(card.textContent).toContain('Rp15.000');
    expect(await screen.findByText(/Menu dan harga memakai data tersimpan di perangkat \(07\/10\/2026 10:00 WIB\)/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offline with no device copy: the error state with Coba Lagi', async () => {
    mocks.fetchCatalog.mockRejectedValue(offline());
    renderKasir();

    expect(await screen.findByText('Menu gagal dimuat')).toBeTruthy();
  });

  it('back online: refreshes from the server, replacing the device copy and its prices', async () => {
    await saveCatalog('cashier-1', 'store-a', CACHED, SAVED_AT);
    mocks.fetchCatalog.mockRejectedValueOnce(offline()).mockResolvedValue(SERVER);
    renderKasir();
    expect((await screen.findByRole('button', { name: /^Nasi Goreng/ })).textContent).toContain('Rp15.000');

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(screen.getByRole('button', { name: /^Nasi Goreng/ }).textContent).toContain('Rp16.000'));
    expect(screen.queryByText(/data tersimpan di perangkat/)).toBeNull();
    expect(mocks.fetchCatalog).toHaveBeenCalledTimes(2);
    await waitFor(async () => expect((await readCatalog('cashier-1', 'store-a'))?.products[0]?.price).toBe(16000));
  });

  it('never shows another user’s saved menu', async () => {
    await saveCatalog('cashier-2', 'store-a', CACHED, SAVED_AT);
    mocks.fetchCatalog.mockRejectedValue(offline());
    renderKasir();

    expect(await screen.findByText('Menu gagal dimuat')).toBeTruthy();
  });
});

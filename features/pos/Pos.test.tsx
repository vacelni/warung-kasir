// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '@/features/auth/account';
import { resetIndexedDb } from '@/lib/test-support/fakeIndexedDb';
import type { Catalog } from './api';
import { CartProvider } from './CartProvider';
import { CartList } from './CartList';
import { CatalogProvider } from './CatalogProvider';
import { ProductPicker } from './ProductPicker';
import { ToastProvider } from '@/components/ui/Toast';

const mocks = vi.hoisted(() => ({ profile: null as Profile | null, fetchCatalog: vi.fn() }));

vi.mock('@/features/auth/AuthProvider', () => ({ useProfile: () => mocks.profile }));
vi.mock('./api', () => ({ fetchCatalog: mocks.fetchCatalog }));

const owner: Profile = { id: 'o', storeId: 's', name: 'Bu Sari', role: 'owner' };
const cashier: Profile = { id: 'c', storeId: 's', name: 'Andi', role: 'cashier' };

const CATALOG: Catalog = {
  categories: [
    { id: 'makanan', name: 'Makanan' },
    { id: 'minuman', name: 'Minuman' },
    { id: 'kosong', name: 'Paket' },
  ],
  products: [
    { id: 'nasi', name: 'Nasi Goreng', price: 15000, categoryId: 'makanan' },
    { id: 'mie', name: 'Mie Goreng', price: 12000, categoryId: 'makanan' },
    { id: 'teh', name: 'Es Teh', price: 5000, categoryId: 'minuman' },
  ],
  store: null,
};

// jsdom does not implement the modal <dialog> methods.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

const fetchSpy = vi.fn();

beforeEach(async () => {
  await resetIndexedDb();
  mocks.profile = cashier;
  mocks.fetchCatalog.mockReset();
  mocks.fetchCatalog.mockResolvedValue(CATALOG);
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The kasir section: both screens share one cart, as in app/(app)/kasir/layout.tsx. */
function renderKasir() {
  return render(
    <ToastProvider>
      <CatalogProvider>
        <CartProvider>
          <ProductPicker />
          <CartList />
        </CartProvider>
      </CatalogProvider>
    </ToastProvider>,
  );
}

async function renderLoaded() {
  renderKasir();
  await screen.findByRole('button', { name: /^Nasi Goreng/ });
}

const card = (name: string) => screen.getByRole('button', { name: new RegExp('^' + name) });

describe('ProductPicker', () => {
  it('lists the products with Rupiah prices and no space after Rp', async () => {
    await renderLoaded();

    expect(card('Nasi Goreng').textContent).toContain('Rp15.000');
    expect(card('Es Teh').textContent).toContain('Rp5.000');
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(3);
  });

  it('shows a loading state, then the products', async () => {
    renderKasir();
    expect(screen.getByRole('status', { name: 'Memuat menu' })).toBeTruthy();
    await screen.findByRole('button', { name: /^Nasi Goreng/ });
    expect(screen.queryByRole('status', { name: 'Memuat menu' })).toBeNull();
  });

  it('filters by search text, ignoring case', async () => {
    await renderLoaded();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Cari menu' }), { target: { value: 'TEH' } });

    expect(screen.queryByRole('button', { name: /^Nasi Goreng/ })).toBeNull();
    expect(card('Es Teh')).toBeTruthy();
  });

  it('filters by category and offers only categories that have products', async () => {
    await renderLoaded();

    const tabs = within(screen.getByRole('group', { name: 'Kategori menu' }));
    expect(tabs.getAllByRole('button').map((tab) => tab.textContent)).toEqual(['Semua', 'Makanan', 'Minuman']);

    fireEvent.click(tabs.getByRole('button', { name: 'Minuman' }));
    expect(screen.queryByRole('button', { name: /^Nasi Goreng/ })).toBeNull();
    expect(card('Es Teh')).toBeTruthy();
    expect(tabs.getByRole('button', { name: 'Minuman' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(tabs.getByRole('button', { name: 'Semua' }));
    expect(card('Nasi Goreng')).toBeTruthy();
  });

  it('explains an empty search and lets the user show everything again', async () => {
    await renderLoaded();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Cari menu' }), { target: { value: 'sate' } });
    expect(screen.getByRole('heading', { name: 'Menu tidak ditemukan' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'TAMPILKAN SEMUA MENU' }));
    expect(card('Nasi Goreng')).toBeTruthy();
  });

  it('adds a product to the cart on a card tap, with a badge and the docked summary (AC-01)', async () => {
    await renderLoaded();
    expect(screen.queryByText('LIHAT PESANAN')).toBeNull();

    fireEvent.click(card('Nasi Goreng'));
    expect(card('Nasi Goreng').textContent).toContain('1 di pesanan');
    expect(screen.getByText('1 item')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'LIHAT PESANAN' }).getAttribute('href')).toBe('/kasir/pesanan');

    fireEvent.click(card('Nasi Goreng'));
    fireEvent.click(card('Es Teh'));
    expect(card('Nasi Goreng').textContent).toContain('2 di pesanan');
    expect(screen.getByText('3 item')).toBeTruthy();
  });

  it('shows the cashier a hint when there is no menu', async () => {
    mocks.fetchCatalog.mockResolvedValue({ categories: [], products: [] });
    renderKasir();

    expect(await screen.findByRole('heading', { name: 'Belum ada menu' })).toBeTruthy();
    expect(screen.getByText('Hubungi Owner untuk menambahkan menu.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'TAMBAH MENU' })).toBeNull();
  });

  it('offers the owner a way to add a menu when there is none', async () => {
    mocks.profile = owner;
    mocks.fetchCatalog.mockResolvedValue({ categories: [], products: [] });
    renderKasir();

    const link = await screen.findByRole('link', { name: 'TAMBAH MENU' });
    expect(link.getAttribute('href')).toBe('/menu');
  });

  it('shows what failed and retries on request', async () => {
    mocks.fetchCatalog.mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderKasir();

    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'COBA LAGI' }));

    await screen.findByRole('button', { name: /^Nasi Goreng/ });
    expect(mocks.fetchCatalog).toHaveBeenCalledTimes(2);
  });
});

describe('CartList', () => {
  it('shows the empty state with a way back to the menu', async () => {
    await renderLoaded();

    expect(screen.getByRole('heading', { name: 'Keranjang masih kosong.' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'PILIH MENU' }).getAttribute('href')).toBe('/kasir');
    expect(screen.queryByRole('link', { name: 'LANJUT BAYAR' })).toBeNull();
  });

  it('opens the payment screen from LANJUT BAYAR once the order has items', async () => {
    await renderLoaded();
    fireEvent.click(card('Es Teh'));

    expect(screen.getByRole('link', { name: 'LANJUT BAYAR' }).getAttribute('href')).toBe('/kasir/bayar');
  });

  it('shows lines with subtotals and the total (AC-03)', async () => {
    await renderLoaded();
    fireEvent.click(card('Nasi Goreng'));
    fireEvent.click(card('Nasi Goreng'));
    fireEvent.click(card('Es Teh'));
    fireEvent.click(card('Es Teh'));

    const lines = screen.getAllByRole('listitem').filter((item) => item.textContent?.includes('Subtotal'));
    expect(lines.map((line) => line.textContent)).toEqual([
      expect.stringContaining('Rp30.000'),
      expect.stringContaining('Rp10.000'),
    ]);
    // Subtotal and Total rows both read Rp40.000.
    expect(screen.getAllByText('Rp40.000').length).toBeGreaterThanOrEqual(2);
  });

  it('increases and decreases quantity, never below 1 (AC-02)', async () => {
    await renderLoaded();
    fireEvent.click(card('Nasi Goreng'));

    const minus = screen.getByRole('button', { name: 'Kurangi Nasi Goreng' }) as HTMLButtonElement;
    expect(minus.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Tambah Nasi Goreng' }));
    expect(screen.getByLabelText('Jumlah 2')).toBeTruthy();
    expect(minus.disabled).toBe(false);

    fireEvent.click(minus);
    expect(screen.getByLabelText('Jumlah 1')).toBeTruthy();
    expect(minus.disabled).toBe(true);
  });

  it('removes a line and returns to the empty state after the last one', async () => {
    await renderLoaded();
    fireEvent.click(card('Nasi Goreng'));
    fireEvent.click(card('Es Teh'));

    fireEvent.click(screen.getByRole('button', { name: 'Hapus Nasi Goreng' }));
    expect(screen.queryByRole('button', { name: 'Hapus Nasi Goreng' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Hapus Es Teh' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Hapus Es Teh' }));
    expect(screen.getByRole('heading', { name: 'Keranjang masih kosong.' })).toBeTruthy();
  });

  it('empties the cart only after confirmation', async () => {
    await renderLoaded();
    fireEvent.click(card('Nasi Goreng'));
    fireEvent.click(card('Es Teh'));

    fireEvent.click(screen.getByRole('button', { name: 'KOSONGKAN PESANAN' }));
    fireEvent.click(screen.getByRole('button', { name: 'BATAL' }));
    expect(screen.getByRole('button', { name: 'Hapus Es Teh' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'KOSONGKAN PESANAN' }));
    fireEvent.click(screen.getByRole('button', { name: 'KOSONGKAN' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Keranjang masih kosong.' })).toBeTruthy());
  });
});

describe('cart operations are local (TEST_PLAN G.3)', () => {
  it('makes no request for add, increase, decrease, remove, or clear', async () => {
    await renderLoaded();
    expect(mocks.fetchCatalog).toHaveBeenCalledTimes(1);

    fireEvent.click(card('Nasi Goreng'));
    fireEvent.click(card('Nasi Goreng'));
    fireEvent.click(card('Es Teh'));
    fireEvent.click(screen.getByRole('button', { name: 'Tambah Es Teh' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kurangi Es Teh' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hapus Es Teh' }));
    fireEvent.click(screen.getByRole('button', { name: 'KOSONGKAN PESANAN' }));
    fireEvent.click(screen.getByRole('button', { name: 'KOSONGKAN' }));

    expect(mocks.fetchCatalog).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

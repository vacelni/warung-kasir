// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import type { Profile } from '@/features/auth/account';
import type { Category } from '@/features/categories/api';
import type { Product } from './api';
import { ProductList } from './ProductList';

const mocks = vi.hoisted(() => ({
  listProducts: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  setProductActive: vi.fn(),
  listCategories: vi.fn(),
  listOptionGroups: vi.fn(),
  listProductLinks: vi.fn(),
  setProductGroups: vi.fn(),
}));

vi.mock('./api', () => ({
  listProducts: mocks.listProducts,
  createProduct: mocks.createProduct,
  updateProduct: mocks.updateProduct,
  setProductActive: mocks.setProductActive,
}));
vi.mock('@/features/categories/api', () => ({ listCategories: mocks.listCategories }));
vi.mock('@/features/options/api', () => ({
  listOptionGroups: mocks.listOptionGroups,
  listProductLinks: mocks.listProductLinks,
  setProductGroups: mocks.setProductGroups,
}));
vi.mock('@/features/auth/AuthProvider', () => ({
  useProfile: (): Profile => ({ id: 'o', storeId: 'store-1', name: 'Bu Sari', role: 'owner' }),
}));

const CATEGORIES: Category[] = [
  { id: 'makanan', name: 'Makanan' },
  { id: 'minuman', name: 'Minuman' },
];
const PRODUCTS: Product[] = [
  { id: 'nasi', name: 'Nasi Goreng', price: 15000, categoryId: 'makanan', isActive: true },
  { id: 'rames', name: 'Nasi Rames', price: 13000, categoryId: 'makanan', isActive: false },
];

// jsdom does not implement the modal <dialog> methods.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

beforeEach(() => {
  mocks.listProducts.mockReset().mockResolvedValue(PRODUCTS);
  mocks.listCategories.mockReset().mockResolvedValue(CATEGORIES);
  mocks.createProduct.mockReset().mockResolvedValue({ ok: true, id: 'new-product' });
  mocks.listOptionGroups.mockReset().mockResolvedValue([]);
  mocks.listProductLinks.mockReset().mockResolvedValue([]);
  mocks.setProductGroups.mockReset().mockResolvedValue({ ok: true });
  mocks.updateProduct.mockReset().mockResolvedValue({ ok: true });
  mocks.setProductActive.mockReset().mockResolvedValue({ ok: true });
});

afterEach(cleanup);

async function renderList() {
  render(
    <ToastProvider>
      <ProductList />
    </ToastProvider>,
  );
  await screen.findByText('Nasi Goreng');
}

const dialog = () => within(screen.getByRole('dialog'));
const openActions = (name: string) => fireEvent.click(screen.getByRole('button', { name: `Aksi untuk ${name}` }));

function fillForm({ name, category, price }: { name?: string; category?: string; price?: string }) {
  const form = dialog();
  if (name !== undefined) fireEvent.change(form.getByLabelText('Nama menu'), { target: { value: name } });
  if (category !== undefined) fireEvent.change(form.getByLabelText('Kategori'), { target: { value: category } });
  if (price !== undefined) fireEvent.change(form.getByLabelText('Harga (Rp)'), { target: { value: price } });
}

const submit = () => fireEvent.click(dialog().getByRole('button', { name: 'SIMPAN' }));

describe('product list', () => {
  it('shows active and inactive products with price, category, and a text status', async () => {
    await renderList();

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('Nasi Goreng');
    expect(rows[0]?.textContent).toContain('Rp15.000');
    expect(rows[0]?.textContent).toContain('Makanan');
    expect(rows[0]?.textContent).toContain('Aktif');
    expect(rows[1]?.textContent).toContain('Rp13.000');
    expect(rows[1]?.textContent).toContain('Nonaktif');
  });

  it('shows a loading state, then an error with a retry that works', async () => {
    mocks.listProducts.mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ToastProvider>
        <ProductList />
      </ToastProvider>,
    );

    expect(screen.getByRole('status').textContent).toContain('Memuat menu');
    expect(await screen.findByRole('alert')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'COBA LAGI' }));
    await screen.findByText('Nasi Goreng');
  });

  it('asks for a category first when none exists', async () => {
    mocks.listProducts.mockResolvedValue([]);
    mocks.listCategories.mockResolvedValue([]);
    render(
      <ToastProvider>
        <ProductList />
      </ToastProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Belum ada kategori' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'BUAT KATEGORI' }).getAttribute('href')).toBe('/kategori');
    expect(screen.queryByRole('button', { name: /TAMBAH MENU/ })).toBeNull();
  });

  it('explains an empty menu and offers to add one', async () => {
    mocks.listProducts.mockResolvedValue([]);
    render(
      <ToastProvider>
        <ProductList />
      </ToastProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Belum ada menu' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /TAMBAH MENU/ }).length).toBeGreaterThan(0);
  });
});

describe('creating a product', () => {
  async function openCreateForm() {
    await renderList();
    fireEvent.click(screen.getByRole('button', { name: /TAMBAH MENU/ }));
    await screen.findByRole('dialog');
  }

  it('saves a valid product with an integer price in the owner’s store, then refreshes the list', async () => {
    await openCreateForm();
    fillForm({ name: '  Soto Ayam ', category: 'makanan', price: '18000' });
    expect(dialog().getByText('Rp18.000')).toBeTruthy();

    submit();

    await waitFor(() =>
      expect(mocks.createProduct).toHaveBeenCalledWith('store-1', { name: 'Soto Ayam', categoryId: 'makanan', price: 18000 }),
    );
    expect(await screen.findByText('Menu ditambahkan.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.listProducts).toHaveBeenCalledTimes(2);
  });

  it('shows required-field errors inline and saves nothing', async () => {
    await openCreateForm();

    submit();

    expect(dialog().getByText('Nama menu wajib diisi.')).toBeTruthy();
    expect(dialog().getByText('Pilih kategori.')).toBeTruthy();
    expect(dialog().getByText('Harga wajib diisi.')).toBeTruthy();
    expect(mocks.createProduct).not.toHaveBeenCalled();
  });

  it.each([
    ['0', 'Harga harus lebih dari Rp0.'],
    ['-5000', 'Harga harus berupa angka bulat, tanpa titik, koma, atau tanda minus.'],
    ['15000.5', 'Harga harus berupa angka bulat, tanpa titik, koma, atau tanda minus.'],
    ['abc', 'Harga harus berupa angka bulat, tanpa titik, koma, atau tanda minus.'],
  ])('rejects the price %j', async (price, message) => {
    await openCreateForm();
    fillForm({ name: 'Soto', category: 'makanan', price });

    submit();

    expect(dialog().getByText(message)).toBeTruthy();
    expect(mocks.createProduct).not.toHaveBeenCalled();
  });

  it('clears a field’s error once the owner edits it', async () => {
    await openCreateForm();
    submit();
    expect(dialog().getByText('Harga wajib diisi.')).toBeTruthy();

    fillForm({ price: '5000' });

    expect(dialog().queryByText('Harga wajib diisi.')).toBeNull();
  });

  it('keeps the sheet open and explains a server failure', async () => {
    mocks.createProduct.mockResolvedValue({ ok: false, message: 'Menu gagal disimpan. Coba lagi.' });
    await openCreateForm();
    fillForm({ name: 'Soto', category: 'makanan', price: '18000' });

    submit();

    expect((await dialog().findByRole('alert')).textContent).toBe('Menu gagal disimpan. Coba lagi.');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(mocks.listProducts).toHaveBeenCalledTimes(1);
  });

  it('creates exactly one product when submitted twice while saving', async () => {
    let finish: (value: { ok: true }) => void = () => {};
    mocks.createProduct.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await openCreateForm();
    fillForm({ name: 'Soto', category: 'makanan', price: '18000' });

    fireEvent.submit(dialog().getByRole('textbox', { name: 'Nama menu' }).closest('form') as HTMLFormElement);
    fireEvent.submit(dialog().getByRole('textbox', { name: 'Nama menu' }).closest('form') as HTMLFormElement);
    finish({ ok: true });

    await screen.findByText('Menu ditambahkan.');
    expect(mocks.createProduct).toHaveBeenCalledTimes(1);
  });

  it('offers only this store’s categories', async () => {
    await openCreateForm();
    const options = within(dialog().getByLabelText('Kategori')).getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Pilih kategori', 'Makanan', 'Minuman']);
  });
});

describe('editing a product', () => {
  it('starts from the product’s values and saves the changed price', async () => {
    await renderList();
    openActions('Nasi Goreng');
    fireEvent.click(dialog().getByRole('button', { name: 'Edit' }));

    const form = dialog();
    expect((form.getByLabelText('Nama menu') as HTMLInputElement).value).toBe('Nasi Goreng');
    expect((form.getByLabelText('Kategori') as HTMLSelectElement).value).toBe('makanan');
    expect((form.getByLabelText('Harga (Rp)') as HTMLInputElement).value).toBe('15000');

    fillForm({ price: '17000' });
    submit();

    await waitFor(() =>
      expect(mocks.updateProduct).toHaveBeenCalledWith('nasi', { name: 'Nasi Goreng', categoryId: 'makanan', price: 17000 }),
    );
    expect(await screen.findByText('Menu diperbarui.')).toBeTruthy();
    expect(mocks.createProduct).not.toHaveBeenCalled();
  });

  it('rejects an edit that sets the price to 0', async () => {
    await renderList();
    openActions('Nasi Goreng');
    fireEvent.click(dialog().getByRole('button', { name: 'Edit' }));

    fillForm({ price: '0' });
    submit();

    expect(dialog().getByText('Harga harus lebih dari Rp0.')).toBeTruthy();
    expect(mocks.updateProduct).not.toHaveBeenCalled();
  });
});

describe('deactivating and reactivating', () => {
  it('deactivates an active product with Nonaktifkan', async () => {
    await renderList();
    openActions('Nasi Goreng');

    expect(dialog().queryByRole('button', { name: 'Aktifkan' })).toBeNull();
    fireEvent.click(dialog().getByRole('button', { name: 'Nonaktifkan' }));

    await waitFor(() => expect(mocks.setProductActive).toHaveBeenCalledWith('nasi', false));
    expect(await screen.findByText('Nasi Goreng dinonaktifkan.')).toBeTruthy();
    expect(mocks.listProducts).toHaveBeenCalledTimes(2);
  });

  it('reactivates an inactive product with Aktifkan', async () => {
    await renderList();
    openActions('Nasi Rames');

    expect(dialog().queryByRole('button', { name: 'Nonaktifkan' })).toBeNull();
    fireEvent.click(dialog().getByRole('button', { name: 'Aktifkan' }));

    await waitFor(() => expect(mocks.setProductActive).toHaveBeenCalledWith('rames', true));
    expect(await screen.findByText('Nasi Rames diaktifkan.')).toBeTruthy();
  });

  it('tells the owner when the change fails and leaves the list as it was', async () => {
    mocks.setProductActive.mockResolvedValue({ ok: false, message: 'Status menu gagal diubah. Coba lagi.' });
    await renderList();
    openActions('Nasi Goreng');

    fireEvent.click(dialog().getByRole('button', { name: 'Nonaktifkan' }));

    expect((await screen.findByText('Status menu gagal diubah. Coba lagi.')).closest('[role="alert"]')).toBeTruthy();
    expect(mocks.listProducts).toHaveBeenCalledTimes(1);
  });

  it('offers no way to delete a product (no hard delete in the MVP)', async () => {
    await renderList();

    for (const name of ['Nasi Goreng', 'Nasi Rames']) {
      openActions(name);
      const labels = dialog().getAllByRole('button').map((button) => button.textContent);
      expect(labels.join(' ')).not.toMatch(/hapus|delete/i);
      fireEvent.click(dialog().getByRole('button', { name: 'Tutup' }));
    }
    expect(screen.queryByRole('button', { name: /hapus|delete/i })).toBeNull();
  });
});

describe('option groups on a menu item (DATABASE D.12)', () => {
  const group = (id: string, name: string, required = true) => ({ id, name, allowMultiple: false, required, choices: [] });
  const GROUPS = [group('g-level', 'Level'), group('g-nasi', 'Nasi', false), group('g-bagian', 'Bagian ayam')];

  it('attaches the ticked groups to a new menu item, in the order they were ticked', async () => {
    mocks.listOptionGroups.mockResolvedValue(GROUPS);
    await renderList();

    fireEvent.click(screen.getByRole('button', { name: /TAMBAH MENU/ }));
    fillForm({ name: 'Geprek', category: 'makanan', price: '12000' });
    fireEvent.click(dialog().getByRole('checkbox', { name: /Bagian ayam/ }));
    fireEvent.click(dialog().getByRole('checkbox', { name: /Level/ }));
    submit();

    await waitFor(() => expect(mocks.setProductGroups).toHaveBeenCalledWith('store-1', 'new-product', ['g-bagian', 'g-level']));
  });

  it('shows the order the cashier will see', async () => {
    mocks.listOptionGroups.mockResolvedValue(GROUPS);
    await renderList();

    fireEvent.click(screen.getByRole('button', { name: /TAMBAH MENU/ }));
    fireEvent.click(dialog().getByRole('checkbox', { name: /Nasi/ }));
    fireEvent.click(dialog().getByRole('checkbox', { name: /Level/ }));

    expect(dialog().getByText(/Urutan 1 · Opsional/)).toBeTruthy();
    expect(dialog().getByText(/Urutan 2 · Wajib/)).toBeTruthy();
  });

  it('starts an existing item with the groups it already shows and leaves them alone when untouched', async () => {
    mocks.listOptionGroups.mockResolvedValue(GROUPS);
    mocks.listProductLinks.mockResolvedValue([
      { productId: 'nasi', groupId: 'g-nasi', position: 1 },
      { productId: 'nasi', groupId: 'g-level', position: 0 },
    ]);
    await renderList();

    expect(screen.getAllByRole('listitem')[0]?.textContent).toContain('2 pilihan');
    openActions('Nasi Goreng');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect((dialog().getByRole('checkbox', { name: /Level/ }) as HTMLInputElement).checked).toBe(true);
    expect((dialog().getByRole('checkbox', { name: /Nasi/ }) as HTMLInputElement).checked).toBe(true);
    expect((dialog().getByRole('checkbox', { name: /Bagian ayam/ }) as HTMLInputElement).checked).toBe(false);

    fillForm({ price: '16000' });
    submit();

    await waitFor(() => expect(mocks.updateProduct).toHaveBeenCalled());
    expect(mocks.setProductGroups).not.toHaveBeenCalled();
  });

  it('removes a group from an existing item', async () => {
    mocks.listOptionGroups.mockResolvedValue(GROUPS);
    mocks.listProductLinks.mockResolvedValue([{ productId: 'nasi', groupId: 'g-level', position: 0 }]);
    await renderList();

    openActions('Nasi Goreng');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(dialog().getByRole('checkbox', { name: /Level/ }));
    submit();

    await waitFor(() => expect(mocks.setProductGroups).toHaveBeenCalledWith('store-1', 'nasi', []));
  });

  it('keeps the sheet open and says so when the item saved but its groups did not', async () => {
    mocks.listOptionGroups.mockResolvedValue(GROUPS);
    mocks.setProductGroups.mockResolvedValue({ ok: false, message: 'Tidak dapat terhubung ke server.' });
    await renderList();

    fireEvent.click(screen.getByRole('button', { name: /TAMBAH MENU/ }));
    fillForm({ name: 'Geprek', category: 'makanan', price: '12000' });
    fireEvent.click(dialog().getByRole('checkbox', { name: /Level/ }));
    submit();

    expect(await dialog().findByText(/Menu tersimpan, tetapi pilihan menu gagal disimpan/)).toBeTruthy();
  });

  it('points the owner to Pilihan Menu when no groups exist yet', async () => {
    await renderList();
    fireEvent.click(screen.getByRole('button', { name: /TAMBAH MENU/ }));
    expect(dialog().getByText(/Belum ada pilihan/)).toBeTruthy();
  });
});

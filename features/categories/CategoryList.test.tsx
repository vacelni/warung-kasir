// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import type { Profile } from '@/features/auth/account';
import type { Category } from './api';
import { CategoryList } from './CategoryList';

const mocks = vi.hoisted(() => ({
  listCategories: vi.fn(),
  countProductsPerCategory: vi.fn(),
  createCategory: vi.fn(),
  renameCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

vi.mock('./api', async (importOriginal) => ({
  // Keep the real message helper so the tests check the text users actually see.
  ...(await importOriginal<typeof import('./api')>()),
  listCategories: mocks.listCategories,
  countProductsPerCategory: mocks.countProductsPerCategory,
  createCategory: mocks.createCategory,
  renameCategory: mocks.renameCategory,
  deleteCategory: mocks.deleteCategory,
}));
vi.mock('@/features/auth/AuthProvider', () => ({
  useProfile: (): Profile => ({ id: 'o', storeId: 'store-1', name: 'Bu Sari', role: 'owner' }),
}));

const CATEGORIES: Category[] = [
  { id: 'makanan', name: 'Makanan' },
  { id: 'paket', name: 'Paket' },
  { id: 'lama', name: 'Lama' },
];
// "Lama" is used only by an inactive product: the count still includes it.
const COUNTS = { makanan: 3, lama: 1 };

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

beforeEach(() => {
  mocks.listCategories.mockReset().mockResolvedValue(CATEGORIES);
  mocks.countProductsPerCategory.mockReset().mockResolvedValue(COUNTS);
  mocks.createCategory.mockReset().mockResolvedValue({ ok: true });
  mocks.renameCategory.mockReset().mockResolvedValue({ ok: true });
  mocks.deleteCategory.mockReset().mockResolvedValue({ ok: true });
});

afterEach(cleanup);

async function renderList() {
  render(
    <ToastProvider>
      <CategoryList />
    </ToastProvider>,
  );
  await screen.findByText('Makanan');
}

const dialog = () => within(screen.getByRole('dialog'));
const openActions = (name: string) => fireEvent.click(screen.getByRole('button', { name: `Aksi untuk ${name}` }));

function startDelete(name: string) {
  openActions(name);
  fireEvent.click(dialog().getByRole('button', { name: 'Hapus' }));
}

describe('category list', () => {
  it('lists categories with how many menu use each', async () => {
    await renderList();

    const rows = screen.getAllByRole('listitem').map((row) => row.textContent);
    expect(rows[0]).toContain('Makanan');
    expect(rows[0]).toContain('3 menu');
    expect(rows[1]).toContain('Paket');
    expect(rows[1]).toContain('0 menu');
    expect(rows[2]).toContain('1 menu');
  });

  it('shows an error with a retry that works', async () => {
    mocks.listCategories.mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ToastProvider>
        <CategoryList />
      </ToastProvider>,
    );

    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'COBA LAGI' }));
    await screen.findByText('Makanan');
  });

  it('invites the owner to add the first category', async () => {
    mocks.listCategories.mockResolvedValue([]);
    mocks.countProductsPerCategory.mockResolvedValue({});
    render(
      <ToastProvider>
        <CategoryList />
      </ToastProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Belum ada kategori' })).toBeTruthy();
  });
});

describe('creating a category', () => {
  async function openCreateForm() {
    await renderList();
    fireEvent.click(screen.getAllByRole('button', { name: /TAMBAH KATEGORI/ })[0]!);
    await screen.findByRole('dialog');
  }

  it('saves the trimmed name for the owner’s store and refreshes the list', async () => {
    await openCreateForm();

    fireEvent.change(dialog().getByLabelText('Nama kategori'), { target: { value: '  Snack ' } });
    fireEvent.click(dialog().getByRole('button', { name: 'SIMPAN' }));

    await waitFor(() => expect(mocks.createCategory).toHaveBeenCalledWith('store-1', 'Snack'));
    expect(await screen.findByText('Kategori ditambahkan.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.listCategories).toHaveBeenCalledTimes(2);
  });

  it('requires a name', async () => {
    await openCreateForm();

    fireEvent.change(dialog().getByLabelText('Nama kategori'), { target: { value: '   ' } });
    fireEvent.click(dialog().getByRole('button', { name: 'SIMPAN' }));

    expect(dialog().getByText('Nama kategori wajib diisi.')).toBeTruthy();
    expect(mocks.createCategory).not.toHaveBeenCalled();
  });

  it('shows the duplicate-name message and keeps the sheet open', async () => {
    mocks.createCategory.mockResolvedValue({ ok: false, message: 'Kategori dengan nama ini sudah ada. Gunakan nama lain.' });
    await openCreateForm();

    fireEvent.change(dialog().getByLabelText('Nama kategori'), { target: { value: 'Makanan' } });
    fireEvent.click(dialog().getByRole('button', { name: 'SIMPAN' }));

    expect((await dialog().findByRole('alert')).textContent).toBe('Kategori dengan nama ini sudah ada. Gunakan nama lain.');
    expect(mocks.listCategories).toHaveBeenCalledTimes(1);
  });
});

describe('renaming a category', () => {
  it('opens in a sheet with the current name and saves the new one', async () => {
    await renderList();
    openActions('Paket');
    fireEvent.click(dialog().getByRole('button', { name: 'Ubah nama' }));

    const input = dialog().getByLabelText('Nama kategori') as HTMLInputElement;
    expect(input.value).toBe('Paket');

    fireEvent.change(input, { target: { value: 'Paket Hemat' } });
    fireEvent.click(dialog().getByRole('button', { name: 'SIMPAN' }));

    await waitFor(() => expect(mocks.renameCategory).toHaveBeenCalledWith('paket', 'Paket Hemat'));
    expect(await screen.findByText('Kategori diperbarui.')).toBeTruthy();
    expect(mocks.createCategory).not.toHaveBeenCalled();
  });
});

describe('deleting a category', () => {
  it('deletes a category no product uses, after confirmation', async () => {
    await renderList();
    startDelete('Paket');

    expect(dialog().getByText('Kategori "Paket" akan dihapus.')).toBeTruthy();
    expect(mocks.deleteCategory).not.toHaveBeenCalled();

    fireEvent.click(dialog().getByRole('button', { name: 'HAPUS' }));

    await waitFor(() => expect(mocks.deleteCategory).toHaveBeenCalledWith('paket'));
    expect(await screen.findByText('Kategori dihapus.')).toBeTruthy();
    expect(mocks.listCategories).toHaveBeenCalledTimes(2);
  });

  it('does not delete when the owner cancels', async () => {
    await renderList();
    startDelete('Paket');

    fireEvent.click(dialog().getByRole('button', { name: 'BATAL' }));

    expect(mocks.deleteCategory).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('blocks deleting a category that products use and explains why', async () => {
    await renderList();
    startDelete('Makanan');

    expect(dialog().getByRole('heading', { name: 'Kategori tidak dapat dihapus' })).toBeTruthy();
    expect(dialog().getByText(/masih dipakai oleh 3 menu, termasuk menu yang nonaktif/)).toBeTruthy();
    expect(dialog().queryByRole('button', { name: 'HAPUS' })).toBeNull();
    expect(mocks.deleteCategory).not.toHaveBeenCalled();
  });

  it('counts an inactive product as a use of its category', async () => {
    await renderList();
    startDelete('Lama');

    expect(dialog().getByText(/masih dipakai oleh 1 menu, termasuk menu yang nonaktif/)).toBeTruthy();
    expect(dialog().queryByRole('button', { name: 'HAPUS' })).toBeNull();
  });

  it('shows the same reason when the database refuses a delete the screen thought was fine', async () => {
    // The screen saw 0 menu, but a product was added since: the foreign key still refuses.
    const message = 'Kategori ini masih dipakai oleh menu, termasuk menu yang nonaktif, sehingga tidak dapat dihapus. Pindahkan menu tersebut ke kategori lain lebih dulu.';
    mocks.deleteCategory.mockResolvedValue({ ok: false, inUse: true, message });
    await renderList();
    startDelete('Paket');

    fireEvent.click(dialog().getByRole('button', { name: 'HAPUS' }));

    expect((await dialog().findByRole('alert')).textContent).toBe(message);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(mocks.listCategories).toHaveBeenCalledTimes(1);
  });
});

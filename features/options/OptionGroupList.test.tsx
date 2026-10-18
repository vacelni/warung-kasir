// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import type { Profile } from '@/features/auth/account';
import type { OptionGroup } from './model';
import { OptionGroupList } from './OptionGroupList';

const mocks = vi.hoisted(() => ({
  listOptionGroups: vi.fn(),
  listProductLinks: vi.fn(),
  createGroup: vi.fn(),
  updateGroup: vi.fn(),
  deleteGroup: vi.fn(),
  createChoice: vi.fn(),
  updateChoice: vi.fn(),
  deleteChoice: vi.fn(),
}));

vi.mock('./api', () => ({
  listOptionGroups: mocks.listOptionGroups,
  listProductLinks: mocks.listProductLinks,
  createGroup: mocks.createGroup,
  updateGroup: mocks.updateGroup,
  deleteGroup: mocks.deleteGroup,
  createChoice: mocks.createChoice,
  updateChoice: mocks.updateChoice,
  deleteChoice: mocks.deleteChoice,
}));
vi.mock('@/features/auth/AuthProvider', () => ({
  useProfile: (): Profile => ({ id: 'o', storeId: 'store-1', name: 'Bu Sari', role: 'owner' }),
}));

const choice = (id: string, name: string, priceDelta = 0, extra: Partial<OptionGroup['choices'][number]> = {}) => ({
  id,
  groupId: 'g-level',
  name,
  priceDelta,
  isDefault: false,
  isActive: true,
  position: 0,
  ...extra,
});

const LEVEL: OptionGroup = {
  id: 'g-level',
  name: 'Level',
  allowMultiple: false,
  required: true,
  choices: [choice('l1', 'Level 1', 0, { isDefault: true }), choice('l3', 'Level 3'), choice('l5', 'Level 5', 1000)],
};

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.listOptionGroups.mockResolvedValue([LEVEL]);
  mocks.listProductLinks.mockResolvedValue([
    { productId: 'geprek', groupId: 'g-level', position: 0 },
    { productId: 'bakar', groupId: 'g-level', position: 0 },
  ]);
  for (const name of ['createGroup', 'createChoice']) mocks[name as 'createGroup'].mockResolvedValue({ ok: true, id: 'new-id' });
  for (const name of ['updateGroup', 'deleteGroup', 'updateChoice', 'deleteChoice']) {
    mocks[name as 'updateGroup'].mockResolvedValue({ ok: true });
  }
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderList() {
  render(
    <ToastProvider>
      <OptionGroupList />
    </ToastProvider>,
  );
  await screen.findByText('Level');
}

const dialog = () => within(screen.getByRole('dialog'));

describe('OptionGroupList (owner)', () => {
  it('shows each group with how it is chosen, how many menus use it, and a preview of its choices', async () => {
    await renderList();

    const row = screen.getByRole('button', { name: /Level/ });
    expect(row.textContent).toContain('Wajib');
    expect(row.textContent).toContain('Pilih satu');
    expect(row.textContent).toContain('Dipakai di 2 menu');
    expect(row.textContent).toContain('Level 1, Level 3, Level 5 +Rp1.000');
  });

  it('explains what to do when there are no groups yet', async () => {
    mocks.listOptionGroups.mockResolvedValue([]);
    mocks.listProductLinks.mockResolvedValue([]);
    render(
      <ToastProvider>
        <OptionGroupList />
      </ToastProvider>,
    );

    expect(await screen.findByText('Belum ada pilihan menu')).toBeTruthy();
  });

  it('creates a group, then reopens it so choices can be added straight away', async () => {
    await renderList();
    mocks.listOptionGroups.mockResolvedValue([LEVEL, { id: 'new-id', name: 'Nasi', allowMultiple: false, required: false, choices: [] }]);

    fireEvent.click(screen.getAllByRole('button', { name: /TAMBAH GRUP/ })[0]!);
    fireEvent.change(dialog().getByLabelText('Nama'), { target: { value: 'Nasi' } });
    fireEvent.click(dialog().getByRole('checkbox', { name: /Wajib dipilih/ }));
    fireEvent.click(dialog().getByRole('button', { name: 'SIMPAN DAN ISI PILIHAN' }));

    await waitFor(() => expect(mocks.createGroup).toHaveBeenCalledWith('store-1', { name: 'Nasi', allowMultiple: false, required: false }));
    expect(await screen.findByRole('heading', { name: 'Ubah pilihan menu' })).toBeTruthy();
    expect(dialog().getByText('Belum ada pilihan. Tambahkan di bawah.')).toBeTruthy();
  });

  it('saves changes to an existing group, closes the sheet, and says so', async () => {
    await renderList();
    fireEvent.click(screen.getByRole('button', { name: /Level/ }));
    fireEvent.change(dialog().getByLabelText('Nama'), { target: { value: 'Level pedas' } });
    fireEvent.click(dialog().getByRole('button', { name: 'SIMPAN PERUBAHAN' }));

    await waitFor(() => expect(mocks.updateGroup).toHaveBeenCalledWith('g-level', { name: 'Level pedas', allowMultiple: false, required: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Perubahan disimpan.')).toBeTruthy();
  });

  it('keeps the sheet open and shows the reason when saving a group fails', async () => {
    mocks.updateGroup.mockResolvedValue({ ok: false, message: 'Nama sudah dipakai.' });
    await renderList();
    fireEvent.click(screen.getByRole('button', { name: /Level/ }));
    fireEvent.click(dialog().getByRole('button', { name: 'SIMPAN PERUBAHAN' }));

    expect(await dialog().findByText('Nama sudah dipakai.')).toBeTruthy();
  });

  it('refuses a blank name without calling the server', async () => {
    await renderList();
    fireEvent.click(screen.getAllByRole('button', { name: /TAMBAH GRUP/ })[0]!);
    fireEvent.click(dialog().getByRole('button', { name: 'SIMPAN DAN ISI PILIHAN' }));

    expect(await dialog().findByText('Nama wajib diisi.')).toBeTruthy();
    expect(mocks.createGroup).not.toHaveBeenCalled();
  });

  it('adds a choice with an extra price to an existing group', async () => {
    await renderList();
    fireEvent.click(screen.getByRole('button', { name: /Level/ }));

    fireEvent.change(dialog().getByLabelText('Nama pilihan'), { target: { value: 'Level 4' } });
    fireEvent.change(dialog().getByLabelText('Tambahan harga (Rp)'), { target: { value: '2000' } });
    fireEvent.click(dialog().getByRole('button', { name: 'TAMBAH PILIHAN' }));

    await waitFor(() => expect(mocks.createChoice).toHaveBeenCalledWith('store-1', 'g-level', { name: 'Level 4', priceDelta: 2000 }, 3));
  });

  it('refuses an extra price that is not whole digits', async () => {
    await renderList();
    fireEvent.click(screen.getByRole('button', { name: /Level/ }));

    fireEvent.change(dialog().getByLabelText('Nama pilihan'), { target: { value: 'Level 4' } });
    fireEvent.change(dialog().getByLabelText('Tambahan harga (Rp)'), { target: { value: '2.000' } });
    fireEvent.click(dialog().getByRole('button', { name: 'TAMBAH PILIHAN' }));

    expect(await dialog().findByText(/angka bulat/)).toBeTruthy();
    expect(mocks.createChoice).not.toHaveBeenCalled();
  });

  it('marks a choice sold out so the cashier no longer sees it', async () => {
    await renderList();
    fireEvent.click(screen.getByRole('button', { name: /Level/ }));

    const row = within(dialog().getByText('Level 3').closest('li')!);
    fireEvent.click(row.getByRole('checkbox', { name: /Tersedia/ }));

    await waitFor(() => expect(mocks.updateChoice).toHaveBeenCalledWith('l3', { isActive: false }));
  });

  it('keeps one automatic choice in a pick-one group: turning one on turns the old one off', async () => {
    await renderList();
    fireEvent.click(screen.getByRole('button', { name: /Level/ }));

    const row = within(dialog().getByText('Level 3').closest('li')!);
    fireEvent.click(row.getByRole('checkbox', { name: /Terpilih otomatis/ }));

    await waitFor(() => expect(mocks.updateChoice).toHaveBeenCalledWith('l3', { isDefault: true }));
    expect(mocks.updateChoice).toHaveBeenCalledWith('l1', { isDefault: false });
  });

  it('edits a choice in place', async () => {
    await renderList();
    fireEvent.click(screen.getByRole('button', { name: /Level/ }));

    fireEvent.click(dialog().getByRole('button', { name: 'Ubah Level 5' }));
    fireEvent.change(dialog().getByDisplayValue('Level 5'), { target: { value: 'Level 5 Pedas' } });
    fireEvent.click(dialog().getByRole('button', { name: 'SIMPAN' }));

    await waitFor(() => expect(mocks.updateChoice).toHaveBeenCalledWith('l5', { name: 'Level 5 Pedas', priceDelta: 1000 }));
  });

  it('shows the reason when a change is refused and leaves the list as it was', async () => {
    mocks.updateChoice.mockResolvedValue({ ok: false, message: 'Anda tidak memiliki izin untuk mengubah pilihan menu.' });
    await renderList();
    fireEvent.click(screen.getByRole('button', { name: /Level/ }));

    fireEvent.click(within(dialog().getByText('Level 3').closest('li')!).getByRole('checkbox', { name: /Tersedia/ }));

    expect(await dialog().findByText('Anda tidak memiliki izin untuk mengubah pilihan menu.')).toBeTruthy();
  });

  it('asks before deleting a group and says how many menus lose it', async () => {
    await renderList();
    fireEvent.click(screen.getByRole('button', { name: /Level/ }));
    fireEvent.click(dialog().getByRole('button', { name: 'HAPUS GRUP INI' }));

    expect(await screen.findByText(/dari 2 menu yang memakainya/)).toBeTruthy();
    expect(mocks.deleteGroup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'HAPUS' }));
    await waitFor(() => expect(mocks.deleteGroup).toHaveBeenCalledWith('g-level'));
  });

  it('shows an error state with a retry when the list cannot be loaded', async () => {
    mocks.listOptionGroups.mockRejectedValueOnce(new Error('offline'));
    render(
      <ToastProvider>
        <OptionGroupList />
      </ToastProvider>,
    );

    expect(await screen.findByText('Pilihan menu gagal dimuat')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'COBA LAGI' }));
    expect(await screen.findByText('Level')).toBeTruthy();
  });
});

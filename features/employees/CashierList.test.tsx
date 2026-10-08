// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import type { Cashier } from './api';
import { CashierList } from './CashierList';

const mocks = vi.hoisted(() => ({
  listCashiers: vi.fn(),
  createCashier: vi.fn(),
  setCashierActive: vi.fn(),
  resetCashierPassword: vi.fn(),
  renameCashier: vi.fn(),
}));

vi.mock('./api', () => mocks);

const CASHIERS: Cashier[] = [
  { id: 'andi', name: 'Andi', isActive: true },
  { id: 'citra', name: 'Citra', isActive: false },
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
  mocks.listCashiers.mockReset().mockResolvedValue(CASHIERS);
  mocks.createCashier.mockReset().mockResolvedValue({ ok: true });
  mocks.setCashierActive.mockReset().mockResolvedValue({ ok: true });
  mocks.resetCashierPassword.mockReset().mockResolvedValue({ ok: true });
  mocks.renameCashier.mockReset().mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderList() {
  render(
    <ToastProvider>
      <CashierList />
    </ToastProvider>,
  );
}

async function renderReady() {
  renderList();
  await screen.findByText('Andi');
}

const dialog = () => within(screen.getByRole('dialog'));
const openActions = (name: string) => fireEvent.click(screen.getByRole('button', { name: `Aksi untuk ${name}` }));

describe('cashier list', () => {
  it('shows each cashier with role and a text status', async () => {
    await renderReady();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('Andi');
    expect(rows[0]?.textContent).toContain('Cashier');
    expect(rows[0]?.textContent).toContain('Aktif');
    expect(rows[1]?.textContent).toContain('Nonaktif');
  });

  it('shows loading, then an error with a working retry', async () => {
    mocks.listCashiers.mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderList();
    expect(screen.getByRole('status').textContent).toContain('Memuat karyawan');
    expect(await screen.findByRole('heading', { name: 'Karyawan gagal dimuat' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'COBA LAGI' }));
    await screen.findByText('Andi');
  });

  it('explains an empty list and offers to add a cashier', async () => {
    mocks.listCashiers.mockResolvedValue([]);
    renderList();
    expect(await screen.findByRole('heading', { name: 'Belum ada kasir' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /TAMBAH KASIR/ }).length).toBeGreaterThan(0);
  });

  it('offers exactly Edit Profil, Reset Password and the status action — no delete, no role change', async () => {
    await renderReady();
    openActions('Andi');
    const buttons = dialog()
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-label') !== 'Tutup')
      .map((button) => button.textContent);
    expect(buttons).toEqual(['Edit Profil', 'Reset Password', 'Nonaktifkan']);

    fireEvent.click(dialog().getByRole('button', { name: 'Tutup' }));
    openActions('Citra');
    expect(dialog().getByRole('button', { name: 'Aktifkan' })).toBeTruthy();
    expect(dialog().queryByRole('button', { name: /hapus|role|owner/i })).toBeNull();
  });
});

describe('creating a cashier', () => {
  async function openForm() {
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: /TAMBAH KASIR/ }));
  }

  function fill(name: string, email: string, password: string) {
    fireEvent.change(dialog().getByLabelText('Nama'), { target: { value: name } });
    fireEvent.change(dialog().getByLabelText('Email login'), { target: { value: email } });
    fireEvent.change(dialog().getByLabelText('Password'), { target: { value: password } });
  }

  it('validates inline without calling the server', async () => {
    await openForm();
    fireEvent.click(dialog().getByRole('button', { name: 'SIMPAN' }));
    expect(dialog().getByText('Nama wajib diisi.')).toBeTruthy();
    expect(dialog().getByText('Email login wajib diisi.')).toBeTruthy();
    expect(dialog().getByText('Password wajib diisi.')).toBeTruthy();

    fill('Fajar', 'fajar', 'pendek');
    fireEvent.click(dialog().getByRole('button', { name: 'SIMPAN' }));
    expect(dialog().getByText('Format email tidak valid.')).toBeTruthy();
    expect(dialog().getByText('Password minimal 8 karakter.')).toBeTruthy();
    expect(mocks.createCashier).not.toHaveBeenCalled();
  });

  it('creates the cashier, shows a confirmation, and reloads the list', async () => {
    await openForm();
    fill(' Fajar ', 'Fajar@Warung.test', 'rahasia-123');
    fireEvent.click(dialog().getByRole('button', { name: 'SIMPAN' }));

    expect(await screen.findByText('Akun kasir Fajar dibuat.')).toBeTruthy();
    expect(mocks.createCashier).toHaveBeenCalledWith({ name: 'Fajar', email: 'fajar@warung.test', password: 'rahasia-123' });
    expect(mocks.listCashiers).toHaveBeenCalledTimes(2);
  });

  it('puts a taken email under the email field and keeps the form open', async () => {
    mocks.createCashier.mockResolvedValue({ ok: false, message: 'Email ini sudah dipakai akun lain. Gunakan email lain.', field: 'email' });
    await openForm();
    fill('Fajar', 'andi@warung.test', 'rahasia-123');
    fireEvent.click(dialog().getByRole('button', { name: 'SIMPAN' }));
    expect(await dialog().findByText('Email ini sudah dipakai akun lain. Gunakan email lain.')).toBeTruthy();
    expect(dialog().getByLabelText('Email login').getAttribute('aria-invalid')).toBe('true');
  });

  it('shows a server failure in the form and disables the buttons while saving', async () => {
    let finish: (value: unknown) => void = () => {};
    mocks.createCashier.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await openForm();
    fill('Fajar', 'fajar@warung.test', 'rahasia-123');
    fireEvent.click(dialog().getByRole('button', { name: 'SIMPAN' }));

    const saving = await dialog().findByRole('button', { name: 'MENYIMPAN…' });
    expect((saving as HTMLButtonElement).disabled).toBe(true);
    finish({ ok: false, message: 'Akun kasir gagal dibuat. Coba lagi.' });
    expect(await dialog().findByRole('alert')).toHaveProperty('textContent', 'Akun kasir gagal dibuat. Coba lagi.');
  });
});

describe('editing a cashier', () => {
  it('renames with the current name prefilled', async () => {
    await renderReady();
    openActions('Andi');
    fireEvent.click(dialog().getByRole('button', { name: 'Edit Profil' }));
    const field = dialog().getByLabelText('Nama') as HTMLInputElement;
    expect(field.value).toBe('Andi');
    fireEvent.change(field, { target: { value: 'Andi Saputra ' } });
    fireEvent.click(dialog().getByRole('button', { name: 'SIMPAN' }));
    expect(await screen.findByText('Nama kasir diperbarui.')).toBeTruthy();
    expect(mocks.renameCashier).toHaveBeenCalledWith('andi', 'Andi Saputra');
  });

  it('resets the password after checking it', async () => {
    await renderReady();
    openActions('Andi');
    fireEvent.click(dialog().getByRole('button', { name: 'Reset Password' }));
    fireEvent.click(dialog().getByRole('button', { name: 'RESET PASSWORD' }));
    expect(dialog().getByText('Password wajib diisi.')).toBeTruthy();

    fireEvent.change(dialog().getByLabelText('Password baru'), { target: { value: 'baru-12345' } });
    fireEvent.click(dialog().getByRole('button', { name: 'RESET PASSWORD' }));
    expect(await screen.findByText('Password Andi direset.')).toBeTruthy();
    expect(mocks.resetCashierPassword).toHaveBeenCalledWith('andi', 'baru-12345');
  });
});

describe('status', () => {
  it('deactivates and reactivates through the Edge Function call', async () => {
    await renderReady();
    openActions('Andi');
    fireEvent.click(dialog().getByRole('button', { name: 'Nonaktifkan' }));
    expect(await screen.findByText('Andi dinonaktifkan.')).toBeTruthy();
    expect(mocks.setCashierActive).toHaveBeenCalledWith('andi', false);

    openActions('Citra');
    fireEvent.click(dialog().getByRole('button', { name: 'Aktifkan' }));
    expect(await screen.findByText('Citra diaktifkan.')).toBeTruthy();
    expect(mocks.setCashierActive).toHaveBeenCalledWith('citra', true);
  });

  it('shows a failure as an error toast', async () => {
    mocks.setCashierActive.mockResolvedValue({ ok: false, message: 'Status kasir gagal diubah. Coba lagi.' });
    await renderReady();
    openActions('Andi');
    fireEvent.click(dialog().getByRole('button', { name: 'Nonaktifkan' }));
    expect(await screen.findByText('Status kasir gagal diubah. Coba lagi.')).toBeTruthy();
    await waitFor(() => expect(mocks.listCashiers).toHaveBeenCalledTimes(2));
  });
});

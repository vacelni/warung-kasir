// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import type { Profile } from '@/features/auth/account';
import { StoreSettings } from './StoreSettings';

const mocks = vi.hoisted(() => ({
  getStoreProfile: vi.fn(),
  saveStoreProfile: vi.fn(),
  saveReceiptNote: vi.fn(),
}));

vi.mock('./api', () => mocks);
vi.mock('@/features/auth/AuthProvider', () => ({
  useProfile: (): Profile => ({ id: 'o', storeId: 'store-a', name: 'Bu Sari', role: 'owner' }),
}));

const STORE = { name: 'Warung Makan Bu Sari', address: 'Jl. Contoh No. 10', phone: null, receiptNote: 'Terima kasih :)' };

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

beforeEach(() => {
  mocks.getStoreProfile.mockReset().mockResolvedValue(STORE);
  mocks.saveStoreProfile.mockReset().mockResolvedValue({ ok: true });
  mocks.saveReceiptNote.mockReset().mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderSettings() {
  render(
    <ToastProvider>
      <StoreSettings />
    </ToastProvider>,
  );
  await screen.findByText('Warung Makan Bu Sari');
}

const dialog = () => within(screen.getByRole('dialog'));

describe('store settings', () => {
  it('shows only the MVP groups, with values and "Belum diisi" for empty ones', async () => {
    await renderSettings();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Profil Warung', 'Struk', 'Data', 'Tentang']);
    expect(screen.getByText('Belum diisi')).toBeTruthy();
    expect(screen.queryByText(/pajak|printer|diskon|logo/i)).toBeNull();
    expect(mocks.getStoreProfile).toHaveBeenCalledWith('store-a');
  });

  it('shows an error with a retry when loading fails', async () => {
    mocks.getStoreProfile.mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ToastProvider>
        <StoreSettings />
      </ToastProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Pengaturan gagal dimuat' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'COBA LAGI' }));
    await screen.findByText('Warung Makan Bu Sari');
  });

  it('edits the store profile with validation, then reloads', async () => {
    await renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Ubah profil warung' }));
    expect((dialog().getByLabelText('Nama warung') as HTMLInputElement).value).toBe('Warung Makan Bu Sari');

    fireEvent.change(dialog().getByLabelText('Nama warung'), { target: { value: ' ' } });
    fireEvent.click(dialog().getByRole('button', { name: 'SIMPAN' }));
    expect(dialog().getByText('Nama warung wajib diisi.')).toBeTruthy();
    expect(mocks.saveStoreProfile).not.toHaveBeenCalled();

    fireEvent.change(dialog().getByLabelText('Nama warung'), { target: { value: 'Warung Bu Sari 2' } });
    fireEvent.change(dialog().getByLabelText('Telepon'), { target: { value: '0812 3456' } });
    fireEvent.click(dialog().getByRole('button', { name: 'SIMPAN' }));
    expect(await screen.findByText('Pengaturan disimpan.')).toBeTruthy();
    expect(mocks.saveStoreProfile).toHaveBeenCalledWith('store-a', { name: 'Warung Bu Sari 2', address: 'Jl. Contoh No. 10', phone: '0812 3456' });
    expect(mocks.getStoreProfile).toHaveBeenCalledTimes(2);
  });

  it('keeps the sheet open with the reason when saving fails', async () => {
    mocks.saveReceiptNote.mockResolvedValue({ ok: false, message: 'Pengaturan gagal disimpan. Coba lagi.' });
    await renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Ubah catatan struk' }));
    fireEvent.change(dialog().getByLabelText('Catatan struk'), { target: { value: 'Sampai jumpa' } });
    fireEvent.click(dialog().getByRole('button', { name: 'SIMPAN' }));
    expect(await dialog().findByRole('alert')).toHaveProperty('textContent', 'Pengaturan gagal disimpan. Coba lagi.');
    expect(mocks.saveReceiptNote).toHaveBeenCalledWith('store-a', 'Sampai jumpa');
  });
});

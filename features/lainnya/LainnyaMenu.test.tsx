// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '@/features/auth/account';
import { resetIndexedDb } from '@/lib/test-support/fakeIndexedDb';
import { LainnyaMenu } from './LainnyaMenu';

const mocks = vi.hoisted(() => ({ profile: null as Profile | null, logout: vi.fn() }));

vi.mock('@/features/auth/AuthProvider', () => ({
  useProfile: () => mocks.profile,
  useAuth: () => ({ logout: mocks.logout }),
}));

const owner: Profile = { id: 'o', storeId: 's', name: 'Bu Sari', role: 'owner' };
const cashier: Profile = { id: 'c', storeId: 's', name: 'Andi', role: 'cashier' };

beforeEach(async () => {
  await resetIndexedDb();
  mocks.logout.mockReset();
});

afterEach(cleanup);

function linkLabels() {
  return screen.getAllByRole('link').map((link) => link.textContent);
}

describe('LainnyaMenu (UI_SPEC A.7)', () => {
  it('shows the owner every management page, sync status, About, and Keluar', () => {
    mocks.profile = owner;
    render(<LainnyaMenu />);

    expect(linkLabels()).toEqual(['Menu', 'Kategori', 'Karyawan', 'Backup / Export', 'Pengaturan', 'Tentang']);
    expect(screen.getByText('Status sinkronisasi')).toBeTruthy();
    expect(screen.getByText('Owner')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keluar' })).toBeTruthy();
  });

  it('shows the cashier only their profile, sync status, About, and Keluar', () => {
    mocks.profile = cashier;
    render(<LainnyaMenu />);

    expect(linkLabels()).toEqual(['Tentang']);
    expect(screen.getByText('Andi')).toBeTruthy();
    expect(screen.getByText('Cashier')).toBeTruthy();
    expect(screen.getByText('Status sinkronisasi')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keluar' })).toBeTruthy();
  });

  it('signs out through the shared auth flow when nothing is waiting to sync', async () => {
    mocks.profile = cashier;
    mocks.logout.mockResolvedValue(undefined);
    render(<LainnyaMenu />);

    fireEvent.click(screen.getByRole('button', { name: 'Keluar' }));

    await waitFor(() => expect(mocks.logout).toHaveBeenCalledOnce());
  });
});

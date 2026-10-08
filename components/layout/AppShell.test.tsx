// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '@/features/auth/account';
import { AppShell } from './AppShell';

const mocks = vi.hoisted(() => ({ profile: null as Profile | null, pathname: '/kasir' }));

vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('@/features/auth/AuthProvider', () => ({
  useProfile: () => mocks.profile,
  useAuth: () => ({ logout: vi.fn() }),
}));

const owner: Profile = { id: 'o', storeId: 's', name: 'Bu Sari', role: 'owner' };
const cashier: Profile = { id: 'c', storeId: 's', name: 'Andi', role: 'cashier' };

beforeEach(() => {
  mocks.pathname = '/kasir';
});

afterEach(cleanup);

function renderShell(profile: Profile) {
  mocks.profile = profile;
  render(
    <AppShell>
      <p>Isi halaman</p>
    </AppShell>,
  );
}

const names = (nav: HTMLElement) => within(nav).getAllByRole('link').map((link) => link.textContent);

describe('AppShell', () => {
  it('gives the owner four bottom tabs and the full sidebar', () => {
    renderShell(owner);

    expect(names(screen.getByRole('navigation', { name: 'Navigasi utama' }))).toEqual([
      'Kasir',
      'Riwayat',
      'Laporan',
      'Lainnya',
    ]);
    expect(names(screen.getByRole('navigation', { name: 'Navigasi samping' }))).toContain('Karyawan');
  });

  it('gives the cashier three bottom tabs and no owner-only sidebar links', () => {
    renderShell(cashier);

    expect(names(screen.getByRole('navigation', { name: 'Navigasi utama' }))).toEqual(['Kasir', 'Riwayat', 'Lainnya']);
    const sidebar = names(screen.getByRole('navigation', { name: 'Navigasi samping' }));
    expect(sidebar).toEqual(['Kasir', 'Riwayat', 'Lainnya']);
  });

  it('marks the current page in both navigations', () => {
    mocks.pathname = '/riwayat';
    renderShell(owner);

    for (const name of ['Navigasi utama', 'Navigasi samping']) {
      const current = within(screen.getByRole('navigation', { name })).getByRole('link', { current: 'page' });
      expect(current.textContent).toBe('Riwayat');
    }
  });

  it('renders the page inside the main landmark and offers a skip link', () => {
    renderShell(cashier);

    expect(within(screen.getByRole('main')).getByText('Isi halaman')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Lewati ke konten' }).getAttribute('href')).toBe('#konten');
  });

  it('shows the user name and role label in the sidebar footer', () => {
    renderShell(owner);

    const sidebar = screen.getByRole('complementary');
    expect(within(sidebar).getByText('Bu Sari')).toBeTruthy();
    expect(within(sidebar).getByText('Owner')).toBeTruthy();
    expect(within(sidebar).getByRole('button', { name: 'Keluar' })).toBeTruthy();
  });
});

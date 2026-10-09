// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from './account';
import { RouteAccess } from './RouteAccess';

const mocks = vi.hoisted(() => ({ profile: null as unknown as Profile, pathname: '/kasir' }));
vi.mock('./AuthProvider', () => ({ useProfile: () => mocks.profile }));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));

const owner: Profile = { id: 'o', storeId: 's', name: 'Bu Sari', role: 'owner' };
const cashier: Profile = { id: 'c', storeId: 's', name: 'Andi', role: 'cashier' };

afterEach(cleanup);

function renderAt(profile: Profile, pathname: string) {
  mocks.profile = profile;
  mocks.pathname = pathname;
  render(
    <RouteAccess>
      <p>isi halaman</p>
    </RouteAccess>,
  );
}

describe('RouteAccess (AC-07, AC-09; UX only — RLS enforces the data rules)', () => {
  it.each(['/kasir', '/riwayat', '/riwayat/detail', '/lainnya', '/tentang'])('lets a cashier open %s', (path) => {
    renderAt(cashier, path);
    expect(screen.getByText('isi halaman')).toBeTruthy();
  });

  it.each(['/laporan', '/menu', '/kategori', '/karyawan', '/pengaturan', '/backup'])(
    'shows a cashier "Akses ditolak" on %s, with a way back to the cashier, and none of the page',
    (path) => {
      renderAt(cashier, path);
      expect(screen.queryByText('isi halaman')).toBeNull();
      expect(screen.getByRole('heading', { name: 'Akses ditolak', level: 1 })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'KEMBALI KE KASIR' }).getAttribute('href')).toBe('/kasir');
    },
  );

  it.each(['/laporan', '/menu', '/kategori', '/karyawan', '/pengaturan', '/backup', '/kasir'])('lets the owner open %s', (path) => {
    renderAt(owner, path);
    expect(screen.getByText('isi halaman')).toBeTruthy();
  });
});

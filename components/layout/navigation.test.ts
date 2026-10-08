import { describe, expect, it } from 'vitest';
import { canAccessRoute } from '@/lib/permissions';
import { bottomNavItems, isNavItemActive, lainnyaManagementItems, sidebarSections } from './navigation';

const labels = (items: { label: string }[]) => items.map((item) => item.label);

describe('bottomNavItems (UI_SPEC A.7)', () => {
  it('gives the owner four tabs', () => {
    expect(labels(bottomNavItems('owner'))).toEqual(['Kasir', 'Riwayat', 'Laporan', 'Lainnya']);
  });

  it('gives the cashier three tabs without Laporan', () => {
    expect(labels(bottomNavItems('cashier'))).toEqual(['Kasir', 'Riwayat', 'Lainnya']);
  });
});

describe('sidebarSections (UI_SPEC A.23)', () => {
  it('lists every owner route', () => {
    const items = sidebarSections('owner').flatMap((section) => section.items);
    expect(labels(items)).toEqual([
      'Kasir',
      'Riwayat',
      'Laporan',
      'Menu',
      'Kategori',
      'Karyawan',
      'Backup / Export',
      'Pengaturan',
      'Tentang',
    ]);
  });

  it('lists only Kasir, Riwayat, and Lainnya for the cashier', () => {
    const items = sidebarSections('cashier').flatMap((section) => section.items);
    expect(labels(items)).toEqual(['Kasir', 'Riwayat', 'Lainnya']);
  });
});

describe('lainnyaManagementItems', () => {
  it('lists the owner management pages and nothing for the cashier', () => {
    expect(labels(lainnyaManagementItems('owner'))).toEqual([
      'Menu',
      'Kategori',
      'Karyawan',
      'Backup / Export',
      'Pengaturan',
    ]);
    expect(lainnyaManagementItems('cashier')).toEqual([]);
  });
});

describe('navigation targets match the route guard', () => {
  it.each(['owner', 'cashier'] as const)('every link shown to the %s is a route that role may open', (role) => {
    const items = [...bottomNavItems(role), ...sidebarSections(role).flatMap((section) => section.items)];
    for (const item of items) {
      expect(canAccessRoute(role, item.href)).toBe(true);
    }
  });
});

describe('isNavItemActive', () => {
  function tab(label: string) {
    const item = bottomNavItems('owner').find((candidate) => candidate.label === label);
    if (!item) throw new Error(`No ${label} tab`);
    return item;
  }
  const kasir = tab('Kasir');
  const lainnya = tab('Lainnya');

  it('matches the route and its sub-routes', () => {
    expect(isNavItemActive(kasir, '/kasir')).toBe(true);
    expect(isNavItemActive(kasir, '/kasir/bayar')).toBe(true);
  });

  it('does not match a route that only shares a prefix', () => {
    expect(isNavItemActive(kasir, '/kasirku')).toBe(false);
  });

  it('keeps Lainnya active on pages reached through it', () => {
    expect(isNavItemActive(lainnya, '/lainnya')).toBe(true);
    expect(isNavItemActive(lainnya, '/menu')).toBe(true);
    expect(isNavItemActive(lainnya, '/tentang')).toBe(true);
    expect(isNavItemActive(lainnya, '/kasir')).toBe(false);
  });
});

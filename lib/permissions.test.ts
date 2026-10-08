import { describe, expect, it } from 'vitest';
import { canAccessRoute, isRole } from './permissions';

const OWNER_ONLY_ROUTES = ['/laporan', '/menu', '/kategori', '/karyawan', '/pengaturan', '/backup'];
const CASHIER_ROUTES = ['/kasir', '/kasir/pesanan', '/kasir/bayar', '/kasir/selesai', '/riwayat', '/riwayat/detail', '/lainnya'];

describe('isRole', () => {
  it('accepts only the two fixed roles', () => {
    expect(isRole('owner')).toBe(true);
    expect(isRole('cashier')).toBe(true);
    expect(isRole('admin')).toBe(false);
    expect(isRole('Owner')).toBe(false);
    expect(isRole(null)).toBe(false);
  });
});

describe('canAccessRoute (PRD §8, SECURITY E.3)', () => {
  it.each([...CASHIER_ROUTES, ...OWNER_ONLY_ROUTES])('owner can open %s', (route) => {
    expect(canAccessRoute('owner', route)).toBe(true);
  });

  it.each(CASHIER_ROUTES)('cashier can open %s', (route) => {
    expect(canAccessRoute('cashier', route)).toBe(true);
  });

  it.each(OWNER_ONLY_ROUTES)('cashier cannot open owner-only %s', (route) => {
    expect(canAccessRoute('cashier', route)).toBe(false);
  });

  it('does not treat a shared prefix as a sub-route', () => {
    expect(canAccessRoute('cashier', '/kasirku')).toBe(false);
    expect(canAccessRoute('cashier', '/riwayat-lain')).toBe(false);
  });

  it('denies unknown routes to the cashier by default', () => {
    expect(canAccessRoute('cashier', '/')).toBe(false);
    expect(canAccessRoute('cashier', '/admin')).toBe(false);
  });
});

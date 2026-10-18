import type { IconName } from '@/components/ui/Icon';
import { canAccessRoute, type Role } from '@/lib/permissions';

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Other path prefixes that keep this item highlighted, e.g. pages reached through "Lainnya". */
  alsoActiveFor?: readonly string[];
};

export type NavSection = { label?: string; items: NavItem[] };

const KASIR: NavItem = { href: '/kasir', label: 'Kasir', icon: 'cart' };
const RIWAYAT: NavItem = { href: '/riwayat', label: 'Riwayat', icon: 'history' };
const LAPORAN: NavItem = { href: '/laporan', label: 'Laporan', icon: 'chart' };
const MENU: NavItem = { href: '/menu', label: 'Menu', icon: 'menu' };
const PILIHAN: NavItem = { href: '/pilihan', label: 'Pilihan Menu', icon: 'options' };
const KATEGORI: NavItem = { href: '/kategori', label: 'Kategori', icon: 'tag' };
const KARYAWAN: NavItem = { href: '/karyawan', label: 'Karyawan', icon: 'users' };
const BACKUP: NavItem = { href: '/backup', label: 'Backup / Export', icon: 'download' };
const PENGATURAN: NavItem = { href: '/pengaturan', label: 'Pengaturan', icon: 'settings' };
const TENTANG: NavItem = { href: '/tentang', label: 'Tentang', icon: 'info' };

const OWNER_MANAGEMENT: readonly NavItem[] = [MENU, PILIHAN, KATEGORI, KARYAWAN, BACKUP, PENGATURAN];

const LAINNYA: NavItem = {
  href: '/lainnya',
  label: 'Lainnya',
  icon: 'more',
  alsoActiveFor: [...OWNER_MANAGEMENT, TENTANG].map((item) => item.href),
};

/** Only items the role may open. Reuses the Phase 2 route rules; this is UX, not authorization. */
function visibleTo(role: Role, items: readonly NavItem[]): NavItem[] {
  return items.filter((item) => canAccessRoute(role, item.href));
}

/** Mobile bottom navigation: Owner 4 tabs, Cashier 3 (UI_SPEC A.7). */
export function bottomNavItems(role: Role): NavItem[] {
  return visibleTo(role, [KASIR, RIWAYAT, LAPORAN, LAINNYA]);
}

/** Desktop sidebar (UI_SPEC A.23): every allowed route; the cashier reaches the rest through Lainnya. */
export function sidebarSections(role: Role): NavSection[] {
  if (role === 'cashier') return [{ items: [KASIR, RIWAYAT, LAINNYA] }];
  return [
    { items: [KASIR, RIWAYAT, LAPORAN] },
    { label: 'Kelola', items: [...OWNER_MANAGEMENT] },
    { items: [TENTANG] },
  ];
}

/** Destinations listed on the Lainnya page, before the sync status row (UI_SPEC A.7). */
export function lainnyaManagementItems(role: Role): NavItem[] {
  return visibleTo(role, OWNER_MANAGEMENT);
}

export const ABOUT_ITEM = TENTANG;

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  const prefixes = [item.href, ...(item.alsoActiveFor ?? [])];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

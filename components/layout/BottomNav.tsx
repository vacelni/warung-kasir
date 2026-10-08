'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/lib/cx';
import type { Role } from '@/lib/permissions';
import { bottomNavItems, isNavItemActive } from './navigation';

/** Phone navigation, fixed to the bottom edge (UI_SPEC A.7). Hidden from `md`, where the sidebar takes over. */
export function BottomNav({ role }: { role: Role }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex h-(--bottom-nav-height)">
        {bottomNavItems(role).map((item) => {
          const active = isNavItemActive(item, pathname);
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'relative flex h-full flex-col items-center justify-center gap-0.5 px-1 text-caption',
                  active ? 'font-semibold text-primary' : 'font-medium text-muted active:bg-subtle',
                )}
              >
                {/* The bar above the icon marks the active tab without relying on color alone. */}
                {active && <span aria-hidden="true" className="absolute inset-x-6 top-0 h-1 rounded-b-full bg-primary" />}
                <Icon name={item.icon} />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { LogoutButton } from '@/features/auth/LogoutButton';
import { SyncIndicator } from '@/features/offline/SyncStatus';
import { cx } from '@/lib/cx';
import { ROLE_LABELS } from '@/lib/permissions';
import type { Profile } from '@/features/auth/account';
import { isNavItemActive, sidebarSections } from './navigation';

/** Desktop and tablet navigation (UI_SPEC A.23). Hidden below `md`, where the bottom navigation takes over. */
export function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-surface md:sticky md:top-0 md:flex md:h-dvh md:flex-col">
      <div className="flex flex-col items-start gap-2 px-5 pt-6 pb-4">
        <p className="text-section-title font-bold text-primary">WarungKasir</p>
        <SyncIndicator />
      </div>

      <nav aria-label="Navigasi samping" className="flex-1 overflow-y-auto px-3 pb-4">
        {sidebarSections(profile.role).map((section, index) => (
          <div key={section.label ?? index} className={cx(index > 0 && 'mt-4 border-t border-border pt-4')}>
            {section.label && (
              <p className="px-3 pb-1 text-caption font-semibold tracking-wide text-muted uppercase">{section.label}</p>
            )}
            <ul className="flex flex-col gap-1">
              {section.items.map((item) => {
                const active = isNavItemActive(item, pathname);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'flex min-h-11 items-center gap-3 rounded-control px-3 text-base',
                        active
                          ? 'bg-primary-soft font-semibold text-primary-ink'
                          : 'font-medium text-foreground hover:bg-subtle active:bg-subtle',
                      )}
                    >
                      <Icon name={item.icon} size={22} className={active ? 'text-primary' : 'text-muted'} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-3 border-t border-border p-4">
        <div className="min-w-0">
          <p className="text-base font-semibold break-words text-foreground">{profile.name}</p>
          <Badge tone="neutral" className="mt-1">
            {ROLE_LABELS[profile.role]}
          </Badge>
        </div>
        <LogoutButton className="w-full" />
      </div>
    </aside>
  );
}

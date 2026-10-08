import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type LinkRowProps = {
  href: string;
  label: string;
  icon: IconName;
  description?: string;
};

const ROW =
  'flex min-h-14 items-center gap-3 px-4 py-2 text-foreground active:bg-subtle hover:bg-subtle';

/** Full-width tappable row for lists of destinations. Place inside a `Card padded={false}` with `divide-y`. */
export function LinkRow({ href, label, icon, description }: LinkRowProps) {
  return (
    <Link href={href} className={ROW}>
      <Icon name={icon} className="shrink-0 text-muted" />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-medium">{label}</span>
        {description && <span className="block text-caption text-muted">{description}</span>}
      </span>
      <Icon name="chevronRight" size={20} className="shrink-0 text-muted" />
    </Link>
  );
}

/** Non-interactive row with the same rhythm as LinkRow, for read-only values or status. */
export function InfoRow({ label, icon, children }: { label: string; icon: IconName; children?: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-2">
      <Icon name={icon} className="shrink-0 text-muted" />
      <span className="min-w-0 flex-1 text-base font-medium text-foreground">{label}</span>
      {children}
    </div>
  );
}

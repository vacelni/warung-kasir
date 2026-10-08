import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

type BackHeaderProps = {
  /** Where the back arrow goes. */
  href: string;
  /** Accessible name of the back arrow, e.g. "Kembali ke menu". */
  backLabel: string;
  title: string;
};

/** "← Title" row of the kasir sub-screens (UI_SPEC A.11–A.12). Renders the page's single <h1>. */
export function BackHeader({ href, backLabel, title }: BackHeaderProps) {
  return (
    <div className="mb-4 flex items-center gap-1">
      <Link
        href={href}
        aria-label={backLabel}
        className="-ml-3 flex h-12 w-12 shrink-0 items-center justify-center rounded-control text-foreground active:bg-subtle"
      >
        <Icon name="chevronLeft" />
      </Link>
      <h1 className="min-w-0 flex-1 text-page-title font-bold text-foreground">{title}</h1>
    </div>
  );
}

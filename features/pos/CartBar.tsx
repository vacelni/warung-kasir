import Link from 'next/link';
import { buttonClasses } from '@/components/ui/Button';
import { formatRupiah, type Money } from '@/lib/money';
import { DockedBar } from './DockedBar';

type CartBarProps = { itemCount: number; total: Money };

/** Order summary docked at the bottom of the menu (UI_SPEC A.9). Shown only when the cart has items. */
export function CartBar({ itemCount, total }: CartBarProps) {
  return (
    <DockedBar>
      <div className="flex flex-col gap-2">
        <p className="flex items-baseline justify-between gap-3">
          <span className="text-base font-medium text-muted">{itemCount} item</span>
          <span className="text-section-title font-bold text-foreground">{formatRupiah(total)}</span>
        </p>
        <Link href="/kasir/pesanan" className={buttonClasses('primary', 'w-full')}>
          LIHAT PESANAN
        </Link>
      </div>
    </DockedBar>
  );
}

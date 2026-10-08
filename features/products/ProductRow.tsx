import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/lib/cx';
import { formatRupiah } from '@/lib/money';
import type { Product } from './api';

type ProductRowProps = {
  product: Product;
  categoryName: string;
  onOpenActions: (product: Product) => void;
};

/** One product: name, price, category, status. The ⋮ button opens the action sheet (UI_SPEC A.17). */
export function ProductRow({ product, categoryName, onOpenActions }: ProductRowProps) {
  return (
    <li className="flex min-h-20 items-center gap-2 py-2 pr-2 pl-4">
      <div className={cx('min-w-0 flex-1', !product.isActive && 'text-muted')}>
        <p className="text-base font-semibold break-words">{product.name}</p>
        <p className="text-price font-bold">{formatRupiah(product.price)}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption">
          <span className="text-muted">{categoryName}</span>
          <Badge tone={product.isActive ? 'success' : 'neutral'}>{product.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
        </p>
      </div>
      <button
        type="button"
        onClick={() => onOpenActions(product)}
        aria-label={`Aksi untuk ${product.name}`}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control text-muted active:bg-subtle hover:bg-subtle"
      >
        <Icon name="moreVertical" />
      </button>
    </li>
  );
}

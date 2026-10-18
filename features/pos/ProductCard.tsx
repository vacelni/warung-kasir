import { Icon } from '@/components/ui/Icon';
import { cx } from '@/lib/cx';
import { formatRupiah } from '@/lib/money';
import type { CatalogProduct } from './filter';

type ProductCardProps = {
  product: CatalogProduct;
  /** Quantity already in the cart; the badge shows when above 0. */
  quantity: number;
  onAdd: (product: CatalogProduct) => void;
};

/**
 * The whole card is the tap target (UI_SPEC A.9); the [+] is a visual cue only. A product with
 * options opens the choice sheet instead of joining the order at once (UI_SPEC A.9a).
 */
export function ProductCard({ product, quantity, onAdd }: ProductCardProps) {
  const inCart = quantity > 0;

  return (
    <button
      type="button"
      onClick={() => onAdd(product)}
      className={cx(
        'relative flex min-h-24 w-full flex-col justify-between gap-2 rounded-card border bg-surface p-3 text-left select-none active:bg-primary-soft',
        inCart ? 'border-primary' : 'border-border',
      )}
    >
      <span className="flex flex-col gap-0.5">
        <span className={cx('text-base font-semibold break-words text-foreground', inCart && 'pr-7')}>{product.name}</span>
        {product.optionGroups.length > 0 && <span className="text-caption text-muted">Ada pilihan</span>}
      </span>
      <span className="flex items-end justify-between gap-2">
        <span className="text-price font-bold text-foreground">{formatRupiah(product.price)}</span>
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white">
          <Icon name="plus" size={20} />
        </span>
      </span>
      {inCart && (
        <>
          <span
            aria-hidden="true"
            className="absolute top-2 right-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary-ink px-1.5 text-caption font-bold text-white"
          >
            {quantity}
          </span>
          <span className="sr-only">{quantity} di pesanan</span>
        </>
      )}
    </button>
  );
}

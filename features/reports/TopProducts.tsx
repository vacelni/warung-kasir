import { formatRupiah } from '@/lib/money';
import type { TopProduct } from './model';

/** Best sellers by units sold, with the revenue from the sale snapshots (UI_SPEC A.16 "Menu Terlaris"). */
export function TopProducts({ products }: { products: readonly TopProduct[] }) {
  return (
    <ol className="flex flex-col divide-y divide-border">
      {products.map((product, index) => (
        <li key={product.productId} className="flex min-h-12 items-center gap-3 py-2">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-caption font-bold text-primary-ink"
          >
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold break-words text-foreground">{product.productName}</p>
            <p className="text-caption text-muted">{formatRupiah(product.revenue)}</p>
          </div>
          <p className="shrink-0 text-price font-bold text-foreground">
            {product.quantity}
            <span className="sr-only"> terjual</span>
          </p>
        </li>
      ))}
    </ol>
  );
}

import { quantityOf, type Cart } from '@/lib/cart';
import type { CatalogProduct } from './filter';
import { ProductCard } from './ProductCard';

/** Two columns on phones (UI_SPEC A.9), more as the screen widens. */
export const PRODUCT_GRID_CLASSES = 'grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4';

type ProductGridProps = {
  products: readonly CatalogProduct[];
  /** Used only to show how many of each product are already in the order. */
  cart: Cart;
  onAdd: (product: CatalogProduct) => void;
};

export function ProductGrid({ products, cart, onAdd }: ProductGridProps) {
  return (
    <ul className={PRODUCT_GRID_CLASSES}>
      {products.map((product) => (
        <li key={product.id} className="flex">
          <ProductCard product={product} quantity={quantityOf(cart, product.id)} onAdd={onAdd} />
        </li>
      ))}
    </ul>
  );
}

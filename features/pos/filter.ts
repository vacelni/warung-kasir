import type { Category } from '@/features/categories/api';
import type { Product } from '@/features/products/api';
import type { CatalogOptionGroup } from '@/lib/options';

/**
 * What the cashier screen needs of a product; the catalog only ever contains active ones.
 * `optionGroups` is empty for a product that is added straight to the order (DATABASE D.12).
 */
export type CatalogProduct = Pick<Product, 'id' | 'name' | 'price' | 'categoryId'> & {
  optionGroups: readonly CatalogOptionGroup[];
};
export type CatalogCategory = Category;

/** `categoryId` null = "Semua". */
export type ProductFilter = { query: string; categoryId: string | null };

/** Case-insensitive substring match on the name, combined with the category tab. */
export function filterProducts(products: readonly CatalogProduct[], filter: ProductFilter): CatalogProduct[] {
  const query = filter.query.trim().toLowerCase();
  return products.filter(
    (product) =>
      (filter.categoryId === null || product.categoryId === filter.categoryId) &&
      (query === '' || product.name.toLowerCase().includes(query)),
  );
}

/** Tabs only for categories that have a product to sell; an empty tab would be a dead end. */
export function categoriesWithProducts(
  categories: readonly CatalogCategory[],
  products: readonly CatalogProduct[],
): CatalogCategory[] {
  const used = new Set(products.map((product) => product.categoryId));
  return categories.filter((category) => used.has(category.id));
}

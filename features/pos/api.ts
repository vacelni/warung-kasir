import { listCategories } from '@/features/categories/api';
import { listActiveProducts } from '@/features/products/api';
import type { CatalogCategory, CatalogProduct } from './filter';

export type Catalog = { products: CatalogProduct[]; categories: CatalogCategory[] };

/**
 * The menu the cashier sells from: active products only (PRD §23) and the store's categories.
 * Reuses the Phase 4 reads, so "active only" is decided in one place. RLS scopes both to the
 * store (SECURITY E.5). One read per visit to /kasir, never per cart action (TECHNICAL_SPEC C.9).
 */
export async function fetchCatalog(): Promise<Catalog> {
  const [products, categories] = await Promise.all([listActiveProducts(), listCategories()]);
  return { products, categories };
}

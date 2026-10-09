import { listCategories } from '@/features/categories/api';
import { listActiveProducts } from '@/features/products/api';
import { getStoreProfile } from '@/features/settings/api';
import type { StoreProfile } from '@/features/settings/validation';
import type { CatalogCategory, CatalogProduct } from './filter';

/** What the device keeps for selling offline; `store` also feeds the receipt view (null when unknown). */
export type Catalog = { products: CatalogProduct[]; categories: CatalogCategory[]; store: StoreProfile | null };

/**
 * The menu the cashier sells from: active products only (PRD §23) and the store's categories.
 * Reuses the Phase 4 reads, so "active only" is decided in one place. RLS scopes both to the
 * store (SECURITY E.5). One read per visit to /kasir, never per cart action (TECHNICAL_SPEC C.9).
 */
export async function fetchCatalog(storeId: string): Promise<Catalog> {
  const [products, categories, store] = await Promise.all([
    listActiveProducts(),
    listCategories(),
    // The receipt header is not needed to sell: a failed read must not stop the cashier screen.
    getStoreProfile(storeId).catch((error: unknown) => {
      console.warn('Could not read the store details for the receipt:', error);
      return null;
    }),
  ]);
  return { products, categories, store };
}

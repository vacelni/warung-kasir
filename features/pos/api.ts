import { listCategories } from '@/features/categories/api';
import { listOptionGroups, listProductLinks } from '@/features/options/api';
import { catalogGroupsFor } from '@/features/options/model';
import { listActiveProducts } from '@/features/products/api';
import { getStoreProfile } from '@/features/settings/api';
import type { StoreProfile } from '@/features/settings/validation';
import type { CatalogCategory, CatalogProduct } from './filter';

/** What the device keeps for selling offline; `store` also feeds the receipt view (null when unknown). */
export type Catalog = { products: CatalogProduct[]; categories: CatalogCategory[]; store: StoreProfile | null };

/**
 * The menu the cashier sells from: active products only (PRD §23), each with the option groups the
 * owner attached (DATABASE D.12), and the store's categories. Reuses the Phase 4 reads, so "active
 * only" is decided in one place. RLS scopes everything to the store (SECURITY E.5). One read per
 * visit to /kasir, never per cart action (TECHNICAL_SPEC C.9).
 *
 * The option groups are read with the products and not optional: if they cannot be read, the whole
 * load fails and the device copy is used. Selling "Geprek" without its choices would be wrong.
 */
export async function fetchCatalog(storeId: string): Promise<Catalog> {
  const [products, categories, groups, links, store] = await Promise.all([
    listActiveProducts(),
    listCategories(),
    listOptionGroups(),
    listProductLinks(),
    // The receipt header is not needed to sell: a failed read must not stop the cashier screen.
    getStoreProfile(storeId).catch((error: unknown) => {
      console.warn('Could not read the store details for the receipt:', error);
      return null;
    }),
  ]);
  return {
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      price: product.price,
      categoryId: product.categoryId,
      optionGroups: catalogGroupsFor(product.id, groups, links),
    })),
    categories,
    store,
  };
}

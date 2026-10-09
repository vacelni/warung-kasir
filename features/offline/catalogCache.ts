import type { Catalog } from '@/features/pos/api';
import { getDb } from '@/lib/idb';

/**
 * Offline copy of the cashier menu (TECHNICAL_SPEC C.10): active products and categories, exactly
 * what /kasir needs to sell. It is application data in IndexedDB, written by the app after a
 * successful read; the service worker never caches Supabase responses.
 *
 * Prices may be stale while offline. That is accepted (D7, SECURITY E.12): a sale keeps the price
 * the cashier saw, and the next online load replaces the copy.
 *
 * One snapshot per device, tagged with its user and store; another user never reads it, and every
 * sign-out clears it. The outbox is a different store and is never touched here.
 */
export type CachedCatalog = Catalog & { savedAt: string };

export async function saveCatalog(userId: string, storeId: string, catalog: Catalog, now: Date): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('catalog', 'readwrite');
  await Promise.all([
    tx.store.clear(),
    tx.store.put({
      user_id: userId,
      store_id: storeId,
      products: catalog.products.map(({ id, name, price, categoryId }) => ({ id, name, price, categoryId })),
      categories: catalog.categories.map(({ id, name }) => ({ id, name })),
      store: catalog.store && {
        name: catalog.store.name,
        address: catalog.store.address,
        phone: catalog.store.phone,
        receipt_note: catalog.store.receiptNote,
      },
      saved_at: now.toISOString(),
    }),
    tx.done,
  ]);
}

export async function readCatalog(userId: string, storeId: string): Promise<CachedCatalog | null> {
  const snapshot = await (await getDb()).get('catalog', userId);
  if (!snapshot || snapshot.store_id !== storeId) return null;
  const store = snapshot.store
    ? { name: snapshot.store.name, address: snapshot.store.address, phone: snapshot.store.phone, receiptNote: snapshot.store.receipt_note }
    : null;
  return { products: snapshot.products, categories: snapshot.categories, store, savedAt: snapshot.saved_at };
}

export async function clearCatalog(): Promise<void> {
  await (await getDb()).clear('catalog');
}

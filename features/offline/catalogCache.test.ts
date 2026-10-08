import { beforeEach, describe, expect, it } from 'vitest';
import { resetIndexedDb } from '@/lib/test-support/fakeIndexedDb';
import { testSnapshot } from '@/lib/test-support/transactions';
import { clearCatalog, readCatalog, saveCatalog } from './catalogCache';
import { enqueueTransaction, getOutboxEntry } from './outbox';

beforeEach(resetIndexedDb);

const CATALOG = {
  products: [
    { id: 'nasi', name: 'Nasi Goreng', price: 15000, categoryId: 'makanan' },
    { id: 'teh', name: 'Es Teh', price: 5000, categoryId: 'minuman' },
  ],
  categories: [
    { id: 'makanan', name: 'Makanan' },
    { id: 'minuman', name: 'Minuman' },
  ],
};
const SAVED_AT = new Date('2026-10-07T03:00:00.000Z');

describe('catalog cache (TECHNICAL_SPEC C.10)', () => {
  it('returns the saved menu to the same user and store, with the time it was saved', async () => {
    await saveCatalog('cashier-1', 'store-a', CATALOG, SAVED_AT);

    expect(await readCatalog('cashier-1', 'store-a')).toEqual({ ...CATALOG, savedAt: '2026-10-07T03:00:00.000Z' });
  });

  it('stores only what the cashier screen needs (no inactive flag, no extra fields)', async () => {
    const withExtra = {
      ...CATALOG,
      products: CATALOG.products.map((product) => ({ ...product, isActive: true, secret: 'x' })),
    };
    await saveCatalog('cashier-1', 'store-a', withExtra, SAVED_AT);

    expect((await readCatalog('cashier-1', 'store-a'))?.products[0]).toEqual({
      id: 'nasi',
      name: 'Nasi Goreng',
      price: 15000,
      categoryId: 'makanan',
    });
  });

  it('never serves one user’s menu to another user, or another store', async () => {
    await saveCatalog('cashier-1', 'store-a', CATALOG, SAVED_AT);

    expect(await readCatalog('cashier-2', 'store-a')).toBeNull();
    expect(await readCatalog('cashier-1', 'store-b')).toBeNull();
  });

  it('keeps one snapshot per device: a new user’s save replaces the previous one', async () => {
    await saveCatalog('cashier-1', 'store-a', CATALOG, SAVED_AT);
    await saveCatalog('cashier-2', 'store-a', { products: [], categories: [] }, SAVED_AT);

    expect(await readCatalog('cashier-1', 'store-a')).toBeNull();
    expect(await readCatalog('cashier-2', 'store-a')).toMatchObject({ products: [] });
  });

  it('logout clears the catalog but never the outbox', async () => {
    await saveCatalog('cashier-1', 'store-a', CATALOG, SAVED_AT);
    await enqueueTransaction(testSnapshot());

    await clearCatalog();

    expect(await readCatalog('cashier-1', 'store-a')).toBeNull();
    expect(await getOutboxEntry(testSnapshot().id)).toMatchObject({ sync_status: 'pending' });
  });
});

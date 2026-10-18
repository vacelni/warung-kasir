import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/lib/idb';
import { resetIndexedDb } from '@/lib/test-support/fakeIndexedDb';
import { testSnapshot } from '@/lib/test-support/transactions';
import { clearCatalog, readCatalog, saveCatalog } from './catalogCache';
import { enqueueTransaction, getOutboxEntry } from './outbox';

beforeEach(resetIndexedDb);

const CATALOG = {
  products: [
    { id: 'nasi', name: 'Nasi Goreng', price: 15000, categoryId: 'makanan', optionGroups: [] },
    { id: 'teh', name: 'Es Teh', price: 5000, categoryId: 'minuman', optionGroups: [] },
  ],
  categories: [
    { id: 'makanan', name: 'Makanan' },
    { id: 'minuman', name: 'Minuman' },
  ],
  store: { name: 'Warung Bu Sari', address: 'Jl. Contoh No. 10', phone: null, receiptNote: 'Terima kasih :)' },
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
      optionGroups: [],
    });
  });

  it('keeps the option groups of a product so a Geprek can be ordered offline', async () => {
    const geprek = {
      id: 'geprek',
      name: 'Geprek',
      price: 12000,
      categoryId: 'makanan',
      optionGroups: [
        {
          id: 'g-level',
          name: 'Level',
          allowMultiple: false,
          required: true,
          choices: [
            { id: 'l1', name: 'Level 1', priceDelta: 0, isDefault: true },
            { id: 'l5', name: 'Level 5', priceDelta: 0, isDefault: false },
          ],
        },
      ],
    };
    await saveCatalog('cashier-1', 'store-a', { ...CATALOG, products: [geprek] }, SAVED_AT);

    expect((await readCatalog('cashier-1', 'store-a'))?.products).toEqual([geprek]);
  });

  it('reads a menu saved before product options existed as products without option groups', async () => {
    const db = await getDb();
    await db.put('catalog', {
      user_id: 'cashier-1',
      store_id: 'store-a',
      products: [{ id: 'nasi', name: 'Nasi Goreng', price: 15000, categoryId: 'makanan' }],
      categories: [],
      saved_at: SAVED_AT.toISOString(),
    });

    expect((await readCatalog('cashier-1', 'store-a'))?.products).toEqual([
      { id: 'nasi', name: 'Nasi Goreng', price: 15000, categoryId: 'makanan', optionGroups: [] },
    ]);
  });

  it('never serves one user’s menu to another user, or another store', async () => {
    await saveCatalog('cashier-1', 'store-a', CATALOG, SAVED_AT);

    expect(await readCatalog('cashier-2', 'store-a')).toBeNull();
    expect(await readCatalog('cashier-1', 'store-b')).toBeNull();
  });

  it('keeps one snapshot per device: a new user’s save replaces the previous one', async () => {
    await saveCatalog('cashier-1', 'store-a', CATALOG, SAVED_AT);
    await saveCatalog('cashier-2', 'store-a', { products: [], categories: [], store: null }, SAVED_AT);

    expect(await readCatalog('cashier-1', 'store-a')).toBeNull();
    expect(await readCatalog('cashier-2', 'store-a')).toMatchObject({ products: [] });
  });

  it('keeps the store details for the receipt view offline; a snapshot without them reads as null', async () => {
    await saveCatalog('cashier-1', 'store-a', CATALOG, SAVED_AT);
    expect((await readCatalog('cashier-1', 'store-a'))?.store).toEqual(CATALOG.store);

    await saveCatalog('cashier-1', 'store-a', { ...CATALOG, store: null }, SAVED_AT);
    expect((await readCatalog('cashier-1', 'store-a'))?.store).toBeNull();
  });

  it('logout clears the catalog but never the outbox', async () => {
    await saveCatalog('cashier-1', 'store-a', CATALOG, SAVED_AT);
    await enqueueTransaction(testSnapshot());

    await clearCatalog();

    expect(await readCatalog('cashier-1', 'store-a')).toBeNull();
    expect(await getOutboxEntry(testSnapshot().id)).toMatchObject({ sync_status: 'pending' });
  });
});

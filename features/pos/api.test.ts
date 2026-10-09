import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCatalog } from './api';

const mocks = vi.hoisted(() => ({ listActiveProducts: vi.fn(), listCategories: vi.fn(), listProducts: vi.fn(), getStoreProfile: vi.fn() }));
const STORE = { name: 'Warung Bu Sari', address: null, phone: null, receiptNote: null };

vi.mock('@/features/products/api', () => ({
  listActiveProducts: mocks.listActiveProducts,
  // The owner's list (inactive included) must never be what the cashier screen reads.
  listProducts: mocks.listProducts,
}));
vi.mock('@/features/categories/api', () => ({ listCategories: mocks.listCategories }));
vi.mock('@/features/settings/api', () => ({ getStoreProfile: mocks.getStoreProfile }));

beforeEach(() => {
  mocks.listActiveProducts.mockReset();
  mocks.listCategories.mockReset();
  mocks.listProducts.mockReset();
  mocks.getStoreProfile.mockReset();
  mocks.getStoreProfile.mockResolvedValue(STORE);
});

describe('fetchCatalog', () => {
  it('returns the active products and the categories, and never reads inactive products', async () => {
    const products = [{ id: 'p', name: 'Es Teh', price: 5000, categoryId: 'c', isActive: true }];
    const categories = [{ id: 'c', name: 'Minuman' }];
    mocks.listActiveProducts.mockResolvedValue(products);
    mocks.listCategories.mockResolvedValue(categories);

    await expect(fetchCatalog('store-a')).resolves.toEqual({ products, categories, store: STORE });
    expect(mocks.getStoreProfile).toHaveBeenCalledWith('store-a');
    expect(mocks.listProducts).not.toHaveBeenCalled();
  });

  it('fails as a whole when either read fails, so the screen shows its error state', async () => {
    mocks.listActiveProducts.mockResolvedValue([]);
    mocks.listCategories.mockRejectedValue(new Error('offline'));

    await expect(fetchCatalog('store-a')).rejects.toThrow('offline');
  });

  it('still returns the menu when only the store details cannot be read (they are for the receipt)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.listActiveProducts.mockResolvedValue([]);
    mocks.listCategories.mockResolvedValue([]);
    mocks.getStoreProfile.mockRejectedValue(new Error('offline'));

    await expect(fetchCatalog('store-a')).resolves.toEqual({ products: [], categories: [], store: null });
  });
});

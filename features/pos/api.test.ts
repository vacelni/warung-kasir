import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCatalog } from './api';

const mocks = vi.hoisted(() => ({ listActiveProducts: vi.fn(), listCategories: vi.fn(), listProducts: vi.fn() }));

vi.mock('@/features/products/api', () => ({
  listActiveProducts: mocks.listActiveProducts,
  // The owner's list (inactive included) must never be what the cashier screen reads.
  listProducts: mocks.listProducts,
}));
vi.mock('@/features/categories/api', () => ({ listCategories: mocks.listCategories }));

beforeEach(() => {
  mocks.listActiveProducts.mockReset();
  mocks.listCategories.mockReset();
  mocks.listProducts.mockReset();
});

describe('fetchCatalog', () => {
  it('returns the active products and the categories, and never reads inactive products', async () => {
    const products = [{ id: 'p', name: 'Es Teh', price: 5000, categoryId: 'c', isActive: true }];
    const categories = [{ id: 'c', name: 'Minuman' }];
    mocks.listActiveProducts.mockResolvedValue(products);
    mocks.listCategories.mockResolvedValue(categories);

    await expect(fetchCatalog()).resolves.toEqual({ products, categories });
    expect(mocks.listProducts).not.toHaveBeenCalled();
  });

  it('fails as a whole when either read fails, so the screen shows its error state', async () => {
    mocks.listActiveProducts.mockResolvedValue([]);
    mocks.listCategories.mockRejectedValue(new Error('offline'));

    await expect(fetchCatalog()).rejects.toThrow('offline');
  });
});

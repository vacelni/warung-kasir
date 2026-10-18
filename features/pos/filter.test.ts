import { describe, expect, it } from 'vitest';
import { categoriesWithProducts, filterProducts, type CatalogProduct } from './filter';

const PRODUCTS: CatalogProduct[] = [
  { id: '1', name: 'Nasi Goreng', price: 15000, categoryId: 'makanan', optionGroups: [] },
  { id: '2', name: 'Mie Goreng', price: 12000, categoryId: 'makanan', optionGroups: [] },
  { id: '3', name: 'Es Teh', price: 5000, categoryId: 'minuman', optionGroups: [] },
  { id: '4', name: 'Kerupuk', price: 2000, categoryId: 'snack', optionGroups: [] },
];

const names = (products: CatalogProduct[]) => products.map((product) => product.name);

describe('filterProducts', () => {
  it('returns everything without a query or category', () => {
    expect(filterProducts(PRODUCTS, { query: '', categoryId: null })).toHaveLength(4);
  });

  it('filters by category', () => {
    expect(names(filterProducts(PRODUCTS, { query: '', categoryId: 'makanan' }))).toEqual(['Nasi Goreng', 'Mie Goreng']);
  });

  it('searches case-insensitively and ignores surrounding spaces', () => {
    expect(names(filterProducts(PRODUCTS, { query: '  GORENG ', categoryId: null }))).toEqual(['Nasi Goreng', 'Mie Goreng']);
  });

  it('combines the query with the category', () => {
    expect(names(filterProducts(PRODUCTS, { query: 'goreng', categoryId: 'minuman' }))).toEqual([]);
    expect(names(filterProducts(PRODUCTS, { query: 'teh', categoryId: 'minuman' }))).toEqual(['Es Teh']);
  });

  it('returns nothing when no name matches', () => {
    expect(filterProducts(PRODUCTS, { query: 'sate', categoryId: null })).toEqual([]);
  });

  it('does not change the order of the catalog', () => {
    expect(names(filterProducts(PRODUCTS, { query: 'e', categoryId: null }))).toEqual(['Nasi Goreng', 'Mie Goreng', 'Es Teh', 'Kerupuk']);
  });
});

describe('categoriesWithProducts', () => {
  const CATEGORIES = [
    { id: 'makanan', name: 'Makanan' },
    { id: 'minuman', name: 'Minuman' },
    { id: 'paket', name: 'Paket' },
  ];

  it('drops categories without a sellable product and keeps the order', () => {
    expect(categoriesWithProducts(CATEGORIES, PRODUCTS).map((category) => category.id)).toEqual(['makanan', 'minuman']);
  });

  it('returns nothing when there are no products', () => {
    expect(categoriesWithProducts(CATEGORIES, [])).toEqual([]);
  });
});

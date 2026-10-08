'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { useProfile } from '@/features/auth/AuthProvider';
import { CartBar } from './CartBar';
import { useCart } from './CartProvider';
import { useCatalog } from './CatalogProvider';
import { CategoryTabs } from './CategoryTabs';
import { categoriesWithProducts, filterProducts, type CatalogProduct } from './filter';
import { PRODUCT_GRID_CLASSES, ProductGrid } from './ProductGrid';
import { SearchBar } from '@/components/ui/SearchBar';

/** The cashier screen: search, category tabs, product grid, and the docked order summary (UI_SPEC A.9). */
export function ProductPicker() {
  const { state, reload } = useCatalog();
  const { cart, itemCount, total, add } = useCart();
  const profile = useProfile();
  const [query, setQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const catalog = state.status === 'ready' ? state : null;
  const tabs = useMemo(
    () => (catalog ? categoriesWithProducts(catalog.categories, catalog.products) : []),
    [catalog],
  );
  // A tab can vanish after a reload; fall back to "Semua" instead of showing an empty grid.
  const categoryId = tabs.some((tab) => tab.id === selectedCategoryId) ? selectedCategoryId : null;
  const visible = useMemo(
    () => (catalog ? filterProducts(catalog.products, { query, categoryId }) : []),
    [catalog, query, categoryId],
  );

  function resetFilters() {
    setQuery('');
    setSelectedCategoryId(null);
  }

  function addToCart(product: CatalogProduct) {
    add({ id: product.id, name: product.name, price: product.price });
  }

  return (
    <>
      <h1 className="sr-only">Kasir</h1>

      {state.status === 'loading' && (
        <div aria-busy="true" aria-label="Memuat menu" role="status" className="flex flex-col gap-4">
          <Skeleton className="h-12" />
          <div className="flex gap-2">
            <Skeleton className="h-11 w-20 rounded-full" />
            <Skeleton className="h-11 w-24 rounded-full" />
            <Skeleton className="h-11 w-24 rounded-full" />
          </div>
          <div className={PRODUCT_GRID_CLASSES}>
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-24 rounded-card" />
            ))}
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <ErrorState
          title="Menu gagal dimuat"
          description="Daftar menu tidak dapat diambil, jadi pesanan belum bisa dibuat. Periksa koneksi internet lalu coba lagi."
          actions={<Button onClick={reload}>COBA LAGI</Button>}
        />
      )}

      {catalog && catalog.products.length === 0 && (
        <EmptyState
          icon="menu"
          title="Belum ada menu"
          description={
            profile.role === 'owner'
              ? 'Tambahkan menu terlebih dahulu agar transaksi dapat dilakukan.'
              : 'Hubungi Owner untuk menambahkan menu.'
          }
          actions={
            profile.role === 'owner' && (
              <Link href="/menu" className={buttonClasses('primary', 'w-full')}>
                TAMBAH MENU
              </Link>
            )
          }
        />
      )}

      {catalog && catalog.products.length > 0 && (
        <div className="flex flex-col gap-4">
          <SearchBar value={query} onChange={setQuery} />
          <CategoryTabs categories={tabs} selectedId={categoryId} onSelect={setSelectedCategoryId} />

          {visible.length === 0 ? (
            <EmptyState
              icon="search"
              title="Menu tidak ditemukan"
              description="Tidak ada menu yang cocok dengan pencarian atau kategori ini."
              actions={
                <Button variant="secondary" onClick={resetFilters}>
                  TAMPILKAN SEMUA MENU
                </Button>
              }
            />
          ) : (
            <ProductGrid products={visible} cart={cart} onAdd={addToCart} />
          )}
        </div>
      )}

      {itemCount > 0 && (
        <>
          {/* Keeps the last row of products clear of the docked bar. */}
          <div aria-hidden="true" className="h-28" />
          <CartBar itemCount={itemCount} total={total} />
        </>
      )}
    </>
  );
}

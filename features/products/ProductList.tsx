'use client';

import Link from 'next/link';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { LoadingState } from '@/components/shared/LoadingState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useProfile } from '@/features/auth/AuthProvider';
import { formatRupiah } from '@/lib/money';
import { setProductActive, type Product } from './api';
import { ProductForm } from './ProductForm';
import { ProductRow } from './ProductRow';
import { useProducts } from './useProducts';

type DialogState = { type: 'create' } | { type: 'actions'; product: Product } | { type: 'edit'; product: Product };

/**
 * Owner screen for the menu (UI_SPEC A.17): every product with its status, create and edit in a
 * sheet, and Nonaktifkan / Aktifkan. There is no delete: "Hapus" means deactivate (PRD §23).
 */
export function ProductList() {
  const { storeId } = useProfile();
  const toast = useToast();
  const { state, retry, refresh } = useProducts();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  // A new key per opening gives each form fresh state.
  const [generation, setGeneration] = useState(0);

  function show(next: DialogState) {
    setGeneration((value) => value + 1);
    setDialog(next);
  }

  const close = () => setDialog(null);

  async function saved(message: string) {
    close();
    toast.show(message, 'success');
    await refresh();
  }

  async function toggleActive(product: Product) {
    close();
    const nextActive = !product.isActive;
    const result = await setProductActive(product.id, nextActive);
    if (!result.ok) {
      toast.show(result.message, 'danger');
      return;
    }
    toast.show(`${product.name} ${nextActive ? 'diaktifkan' : 'dinonaktifkan'}.`, 'success');
    await refresh();
  }

  const categories = state.status === 'ready' ? state.categories : [];
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const selected = dialog && 'product' in dialog ? dialog.product : undefined;
  // A product needs a category, so adding is offered only once one exists.
  const canAdd = state.status === 'ready' && categories.length > 0;

  return (
    <>
      <PageHeader
        title="Menu"
        action={
          canAdd && (
            <Button onClick={() => show({ type: 'create' })}>
              <Icon name="plus" size={20} />
              TAMBAH MENU
            </Button>
          )
        }
      />

      {state.status === 'loading' && <LoadingState label="Memuat menu…" />}

      {state.status === 'error' && (
        <ErrorState
          title="Menu gagal dimuat"
          description="Daftar menu tidak dapat diambil. Periksa koneksi internet lalu coba lagi."
          actions={<Button onClick={retry}>COBA LAGI</Button>}
        />
      )}

      {state.status === 'ready' && categories.length === 0 && (
        <EmptyState
          icon="tag"
          title="Belum ada kategori"
          description="Setiap menu membutuhkan kategori. Buat kategori terlebih dahulu."
          actions={
            <Link href="/kategori" className={buttonClasses('primary', 'w-full')}>
              BUAT KATEGORI
            </Link>
          }
        />
      )}

      {canAdd && state.products.length === 0 && (
        <EmptyState
          icon="menu"
          title="Belum ada menu"
          description="Tambahkan menu agar transaksi dapat dilakukan."
          actions={<Button onClick={() => show({ type: 'create' })}>TAMBAH MENU</Button>}
        />
      )}

      {canAdd && state.products.length > 0 && (
        <Card padded={false}>
          <ul className="divide-y divide-border">
            {state.products.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                categoryName={categoryNames.get(product.categoryId) ?? '—'}
                onOpenActions={(target) => show({ type: 'actions', product: target })}
              />
            ))}
          </ul>
        </Card>
      )}

      <Dialog
        open={dialog?.type === 'actions'}
        onClose={close}
        title={selected?.name ?? ''}
        description={selected ? `${formatRupiah(selected.price)} · ${selected.isActive ? 'Aktif' : 'Nonaktif'}` : undefined}
      >
        <div className="flex flex-col gap-3">
          <Button variant="secondary" onClick={() => selected && show({ type: 'edit', product: selected })}>
            Edit
          </Button>
          {selected?.isActive ? (
            <Button variant="danger-outline" onClick={() => void toggleActive(selected)}>
              Nonaktifkan
            </Button>
          ) : (
            selected && <Button onClick={() => void toggleActive(selected)}>Aktifkan</Button>
          )}
        </div>
      </Dialog>

      <ProductForm
        key={`form-${generation}`}
        open={dialog?.type === 'create' || dialog?.type === 'edit'}
        product={dialog?.type === 'edit' ? dialog.product : undefined}
        categories={categories}
        storeId={storeId}
        onClose={close}
        onSaved={saved}
      />
    </>
  );
}

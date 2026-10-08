'use client';

import { useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { LoadingState } from '@/components/shared/LoadingState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useProfile } from '@/features/auth/AuthProvider';
import type { Category } from './api';
import { CategoryDeleteDialog } from './CategoryDeleteDialog';
import { CategoryForm } from './CategoryForm';
import { useCategories } from './useCategories';

type DialogState =
  | { type: 'create' }
  | { type: 'actions'; category: Category }
  | { type: 'rename'; category: Category }
  | { type: 'delete'; category: Category };

/** Owner screen for categories: list, add, rename in a sheet, delete when unused (UI_SPEC A.17 pattern). */
export function CategoryList() {
  const { storeId } = useProfile();
  const toast = useToast();
  const { state, retry, refresh } = useCategories();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  // A new key per opening gives each form and confirmation fresh state.
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

  async function deleted() {
    close();
    toast.show('Kategori dihapus.', 'success');
    await refresh();
  }

  const productCounts = state.status === 'ready' ? state.productCounts : {};
  const selected = dialog && 'category' in dialog ? dialog.category : undefined;

  return (
    <>
      <PageHeader
        title="Kategori"
        action={
          state.status === 'ready' && (
            <Button onClick={() => show({ type: 'create' })}>
              <Icon name="plus" size={20} />
              TAMBAH KATEGORI
            </Button>
          )
        }
      />

      {state.status === 'loading' && <LoadingState label="Memuat kategori…" />}

      {state.status === 'error' && (
        <ErrorState
          title="Kategori gagal dimuat"
          description="Daftar kategori tidak dapat diambil. Periksa koneksi internet lalu coba lagi."
          actions={<Button onClick={retry}>COBA LAGI</Button>}
        />
      )}

      {state.status === 'ready' && state.categories.length === 0 && (
        <EmptyState
          icon="tag"
          title="Belum ada kategori"
          description="Buat kategori seperti Makanan atau Minuman untuk mengelompokkan menu."
          actions={<Button onClick={() => show({ type: 'create' })}>TAMBAH KATEGORI</Button>}
        />
      )}

      {state.status === 'ready' && state.categories.length > 0 && (
        <Card padded={false}>
          <ul className="divide-y divide-border">
            {state.categories.map((category) => (
              <li key={category.id} className="flex min-h-16 items-center gap-2 py-2 pr-2 pl-4">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold break-words text-foreground">{category.name}</p>
                  <p className="text-caption text-muted">{productCounts[category.id] ?? 0} menu</p>
                </div>
                <button
                  type="button"
                  onClick={() => show({ type: 'actions', category })}
                  aria-label={`Aksi untuk ${category.name}`}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control text-muted active:bg-subtle hover:bg-subtle"
                >
                  <Icon name="moreVertical" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Dialog open={dialog?.type === 'actions'} onClose={close} title={selected?.name ?? ''}>
        <div className="flex flex-col gap-3">
          <Button variant="secondary" onClick={() => selected && show({ type: 'rename', category: selected })}>
            Ubah nama
          </Button>
          <Button variant="danger-outline" onClick={() => selected && show({ type: 'delete', category: selected })}>
            Hapus
          </Button>
        </div>
      </Dialog>

      <CategoryForm
        key={`form-${generation}`}
        open={dialog?.type === 'create' || dialog?.type === 'rename'}
        category={dialog?.type === 'rename' ? dialog.category : undefined}
        storeId={storeId}
        onClose={close}
        onSaved={saved}
      />

      <CategoryDeleteDialog
        key={`delete-${generation}`}
        open={dialog?.type === 'delete'}
        category={dialog?.type === 'delete' ? dialog.category : undefined}
        productCount={dialog?.type === 'delete' ? (productCounts[dialog.category.id] ?? 0) : 0}
        onClose={close}
        onDeleted={deleted}
      />
    </>
  );
}

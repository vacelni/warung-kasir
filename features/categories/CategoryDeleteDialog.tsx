'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { categoryInUseMessage, deleteCategory, type Category } from './api';

type CategoryDeleteDialogProps = {
  open: boolean;
  category?: Category;
  /** Products using the category, inactive ones included. */
  productCount: number;
  onClose: () => void;
  onDeleted: () => void;
};

/**
 * Confirms deleting a category. A category that products still use is explained instead of
 * offered for deletion; if the count was stale, the database refuses and the same reason shows.
 * Mount with a fresh `key` each time it opens.
 */
export function CategoryDeleteDialog({ open, category, productCount, onClose, onDeleted }: CategoryDeleteDialogProps) {
  const [failure, setFailure] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const inUse = productCount > 0;

  async function confirm() {
    if (!category || submitting) return;
    setFailure(undefined);
    setSubmitting(true);
    const result = await deleteCategory(category.id);
    setSubmitting(false);

    if (result.ok) onDeleted();
    else setFailure(result.message);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!submitting}
      title={inUse ? 'Kategori tidak dapat dihapus' : 'Hapus kategori?'}
      description={inUse ? undefined : `Kategori "${category?.name ?? ''}" akan dihapus.`}
      actions={
        inUse ? (
          <Button variant="secondary" onClick={onClose} data-autofocus>
            TUTUP
          </Button>
        ) : (
          <>
            <Button variant="danger" onClick={confirm} disabled={submitting}>
              {submitting ? 'MENGHAPUS…' : 'HAPUS'}
            </Button>
            <Button variant="secondary" onClick={onClose} disabled={submitting} data-autofocus>
              BATAL
            </Button>
          </>
        )
      }
    >
      {inUse && <Alert tone="warning">{categoryInUseMessage(productCount)}</Alert>}
      {failure && <Alert tone="danger">{failure}</Alert>}
    </Dialog>
  );
}

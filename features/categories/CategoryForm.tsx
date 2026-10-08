'use client';

import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { createCategory, renameCategory, type Category } from './api';
import { validateCategoryName } from './validation';

type CategoryFormProps = {
  open: boolean;
  /** The category being renamed; undefined creates a new one. */
  category?: Category;
  storeId: string;
  onClose: () => void;
  onSaved: (message: string) => void;
};

const FORM_ID = 'category-form';

/**
 * Create or rename a category in a bottom sheet. Mount it with a fresh `key` each time it
 * opens so the fields start clean.
 */
export function CategoryForm({ open, category, storeId, onClose, onSaved }: CategoryFormProps) {
  const [name, setName] = useState(category?.name ?? '');
  const [fieldError, setFieldError] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const checked = validateCategoryName(name);
    if (!checked.ok) {
      setFieldError(checked.message);
      return;
    }

    setFieldError(undefined);
    setFailure(undefined);
    setSubmitting(true);
    const result = category ? await renameCategory(category.id, checked.name) : await createCategory(storeId, checked.name);
    setSubmitting(false);

    if (!result.ok) {
      setFailure(result.message);
      return;
    }
    onSaved(category ? 'Kategori diperbarui.' : 'Kategori ditambahkan.');
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!submitting}
      title={category ? 'Ubah kategori' : 'Tambah kategori'}
      actions={
        <>
          <Button type="submit" form={FORM_ID} disabled={submitting}>
            {submitting ? 'MENYIMPAN…' : 'SIMPAN'}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            BATAL
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {failure && <Alert tone="danger">{failure}</Alert>}
        <Input
          label="Nama kategori"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setFieldError(undefined);
          }}
          error={fieldError}
          autoComplete="off"
          data-autofocus
        />
      </form>
    </Dialog>
  );
}

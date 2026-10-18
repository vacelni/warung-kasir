'use client';

import { useId, useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import type { Category } from '@/features/categories/api';
import { setProductGroups } from '@/features/options/api';
import type { OptionGroup } from '@/features/options/model';
import { cx } from '@/lib/cx';
import { formatRupiah } from '@/lib/money';
import { createProduct, updateProduct, type Product } from './api';
import { MAX_NAME_LENGTH, parsePrice, validateProductForm, type ProductFormErrors, type ProductFormValues } from './validation';

type ProductFormProps = {
  open: boolean;
  /** The product being edited; undefined creates a new one. */
  product?: Product;
  categories: readonly Category[];
  /** Every option group the owner has made, and the ids this product already shows (in order). */
  groups: readonly OptionGroup[];
  initialGroupIds: readonly string[];
  storeId: string;
  onClose: () => void;
  onSaved: (message: string) => void;
};

const FORM_ID = 'product-form';

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * Create or edit a product in a bottom sheet. Mount it with a fresh `key` each time it opens
 * so the fields start from the product (or empty).
 */
export function ProductForm({ open, product, categories, groups, initialGroupIds, storeId, onClose, onSaved }: ProductFormProps) {
  const [values, setValues] = useState<ProductFormValues>({
    name: product?.name ?? '',
    categoryId: product?.categoryId ?? '',
    price: product ? String(product.price) : '',
  });
  // Ids of the option groups this product shows, in the order the cashier sees them (order of ticking).
  const [groupIds, setGroupIds] = useState<string[]>([...initialGroupIds]);
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [failure, setFailure] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  function change(field: keyof ProductFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const checked = validateProductForm(values, categories.map((category) => category.id));
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }

    setErrors({});
    setFailure(undefined);
    setSubmitting(true);
    const saved = product
      ? await updateProduct(product.id, checked.input).then((result) => (result.ok ? { ok: true as const, id: product.id } : result))
      : await createProduct(storeId, checked.input);

    if (!saved.ok) {
      setSubmitting(false);
      setFailure(saved.message);
      return;
    }

    // The menu item itself is saved. A failure attaching the groups keeps the sheet open so the
    // owner sees it and can press SIMPAN again (a new item is then updated, not created twice).
    const unchanged = product !== undefined && sameIds(groupIds, initialGroupIds);
    const attached = unchanged ? { ok: true as const } : await setProductGroups(storeId, saved.id, groupIds);
    setSubmitting(false);
    if (!attached.ok) {
      setFailure(`Menu tersimpan, tetapi pilihan menu gagal disimpan. ${attached.message}`);
      return;
    }
    onSaved(product ? 'Menu diperbarui.' : 'Menu ditambahkan.');
  }

  function toggleGroup(id: string) {
    setGroupIds((current) => (current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id]));
  }

  const price = parsePrice(values.price);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!submitting}
      title={product ? 'Ubah menu' : 'Tambah menu'}
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
          label="Nama menu"
          value={values.name}
          onChange={(event) => change('name', event.target.value)}
          error={errors.name}
          autoComplete="off"
          maxLength={MAX_NAME_LENGTH}
          data-autofocus
        />
        <CategorySelect
          categories={categories}
          value={values.categoryId}
          onChange={(value) => change('categoryId', value)}
          error={errors.categoryId}
        />
        <Input
          label="Harga (Rp)"
          value={values.price}
          onChange={(event) => change('price', event.target.value)}
          error={errors.price}
          hint={price.ok ? formatRupiah(price.price) : 'Angka saja, contoh: 15000'}
          inputMode="numeric"
          autoComplete="off"
        />
        <fieldset className="flex flex-col">
          <legend className="mb-1 text-body font-medium text-foreground">Pilihan menu</legend>
          {groups.length === 0 ? (
            <p className="text-body text-muted">
              Belum ada pilihan. Buat grup seperti Level atau Bagian ayam di Lainnya, lalu Pilihan Menu, agar kasir bisa memilihnya.
            </p>
          ) : (
            <>
              <p className="mb-1 text-caption text-muted">
                Centang yang ditanyakan kasir sebelum menu masuk ke pesanan, sesuai urutan centang.
              </p>
              {groups.map((group) => {
                const position = groupIds.indexOf(group.id);
                return (
                  <Checkbox
                    key={group.id}
                    label={group.name}
                    hint={`${position >= 0 ? `Urutan ${position + 1} · ` : ''}${group.required ? 'Wajib' : 'Opsional'} · ${group.choices.length} pilihan`}
                    checked={position >= 0}
                    onChange={() => toggleGroup(group.id)}
                  />
                );
              })}
            </>
          )}
        </fieldset>
      </form>
    </Dialog>
  );
}

type CategorySelectProps = {
  categories: readonly Category[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

/** Native select, so Android shows its own picker. Matches Input: 48px tall, 16px text. */
function CategorySelect({ categories, value, onChange, error }: CategorySelectProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-body font-medium text-foreground">
        Kategori
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cx(
          'min-h-12 w-full rounded-control border bg-surface px-4 text-base text-foreground',
          error ? 'border-danger' : 'border-border-strong focus:border-primary',
        )}
      >
        <option value="">Pilih kategori</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      {error && (
        <p id={errorId} className="text-caption font-medium text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}

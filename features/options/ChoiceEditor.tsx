'use client';

import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { formatRupiah } from '@/lib/money';
import { createChoice, deleteChoice, updateChoice, type SaveResult } from './api';
import type { OptionChoice, OptionGroup } from './model';
import { MAX_OPTION_NAME_LENGTH, parsePriceDelta, validateOptionName } from './validation';

type ChoiceEditorProps = {
  group: OptionGroup;
  storeId: string;
  /** Called after every change so the list behind the dialog shows it. */
  onChanged: () => Promise<void>;
};

/** The choices of one group: add, rename, change the extra price, mark sold out, pick the default, delete. */
export function ChoiceEditor({ group, storeId, onChanged }: ChoiceEditorProps) {
  const [failure, setFailure] = useState<string>();
  const [editingId, setEditingId] = useState<string | null>(null);
  // A checkbox shows the new value the moment it is tapped, not after the round trip to the server.
  // The entry is dropped when the change is done, and the list then shows what the server has.
  const [shown, setShown] = useState<Record<string, Partial<Pick<OptionChoice, 'isActive' | 'isDefault'>>>>({});

  /** Runs one change, then refreshes. A failure is shown here and leaves the list as it was. */
  async function run(action: () => Promise<SaveResult>) {
    setFailure(undefined);
    const result = await action();
    if (!result.ok) {
      setFailure(result.message);
      return false;
    }
    await onChanged();
    return true;
  }

  async function toggle(choice: OptionChoice, change: Partial<Pick<OptionChoice, 'isActive' | 'isDefault'>>) {
    setShown((current) => ({ ...current, [choice.id]: { ...current[choice.id], ...change } }));
    try {
      if ('isDefault' in change) await setDefault(choice, change.isDefault === true);
      else await run(() => updateChoice(choice.id, change));
    } finally {
      setShown((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== choice.id)));
    }
  }

  async function setDefault(choice: OptionChoice, isDefault: boolean) {
    await run(async () => {
      // A pick-one group has at most one automatic choice: turning one on turns the others off.
      if (isDefault && !group.allowMultiple) {
        for (const other of group.choices.filter((c) => c.isDefault && c.id !== choice.id)) {
          const cleared = await updateChoice(other.id, { isDefault: false });
          if (!cleared.ok) return cleared;
        }
      }
      return updateChoice(choice.id, { isDefault });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-semibold text-foreground">Isi pilihan</h3>
      {failure && <Alert tone="danger">{failure}</Alert>}

      {group.choices.length === 0 && <p className="text-body text-muted">Belum ada pilihan. Tambahkan di bawah.</p>}

      <ul className="flex flex-col gap-3">
        {group.choices.map((choice) => (
          <li key={choice.id} className="rounded-card border border-border p-3">
            {editingId === choice.id ? (
              <ChoiceFields
                initialName={choice.name}
                initialPrice={String(choice.priceDelta)}
                submitLabel="SIMPAN"
                onCancel={() => setEditingId(null)}
                onSubmit={async (input) => {
                  const done = await run(() => updateChoice(choice.id, input));
                  if (done) setEditingId(null);
                  return done;
                }}
              />
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold break-words text-foreground">{choice.name}</p>
                    <p className="text-body text-muted">{choice.priceDelta > 0 ? `+${formatRupiah(choice.priceDelta)}` : 'Gratis'}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {!choice.isActive && <Badge tone="danger">Habis</Badge>}
                    {choice.isDefault && <Badge tone="success">Otomatis</Badge>}
                  </div>
                </div>
                <div className="mt-1 flex flex-col">
                  <Checkbox
                    label="Tersedia"
                    hint="Hilangkan centang jika sedang habis."
                    checked={shown[choice.id]?.isActive ?? choice.isActive}
                    onChange={(event) => void toggle(choice, { isActive: event.target.checked })}
                  />
                  <Checkbox
                    label="Terpilih otomatis"
                    checked={shown[choice.id]?.isDefault ?? choice.isDefault}
                    onChange={(event) => void toggle(choice, { isDefault: event.target.checked })}
                  />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={() => setEditingId(choice.id)} aria-label={`Ubah ${choice.name}`}>
                    UBAH
                  </Button>
                  <Button
                    variant="danger-outline"
                    onClick={() => void run(() => deleteChoice(choice.id))}
                    aria-label={`Hapus pilihan ${choice.name}`}
                  >
                    HAPUS
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="rounded-card border border-dashed border-border-strong p-3">
        <ChoiceFields
          key={group.choices.length}
          initialName=""
          initialPrice=""
          submitLabel="TAMBAH PILIHAN"
          onSubmit={async (input) => run(() => createChoice(storeId, group.id, input, group.choices.length))}
        />
      </div>
    </div>
  );
}

type ChoiceFieldsProps = {
  initialName: string;
  initialPrice: string;
  submitLabel: string;
  onSubmit: (input: { name: string; priceDelta: number }) => Promise<boolean>;
  onCancel?: () => void;
};

/** Name and extra price of one choice. The add form starts empty again after a choice is added (its parent changes its key); the price may stay empty for "gratis". */
function ChoiceFields({ initialName, initialPrice, submitLabel, onSubmit, onCancel }: ChoiceFieldsProps) {
  const [name, setName] = useState(initialName);
  const [price, setPrice] = useState(initialPrice);
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const checkedName = validateOptionName(name);
    const checkedPrice = parsePriceDelta(price);
    if (!checkedName.ok || !checkedPrice.ok) {
      setErrors({
        name: checkedName.ok ? undefined : checkedName.message,
        price: checkedPrice.ok ? undefined : checkedPrice.message,
      });
      return;
    }
    setErrors({});
    setSubmitting(true);
    await onSubmit({ name: checkedName.name, priceDelta: checkedPrice.priceDelta });
    setSubmitting(false);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <Input
        label="Nama pilihan"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setErrors((current) => ({ ...current, name: undefined }));
        }}
        error={errors.name}
        maxLength={MAX_OPTION_NAME_LENGTH}
        placeholder="Contoh: Level 3"
        autoComplete="off"
      />
      <Input
        label="Tambahan harga (Rp)"
        value={price}
        onChange={(event) => {
          setPrice(event.target.value);
          setErrors((current) => ({ ...current, price: undefined }));
        }}
        error={errors.price}
        hint="Kosongkan atau isi 0 jika gratis."
        inputMode="numeric"
        autoComplete="off"
      />
      <div className={onCancel ? 'grid grid-cols-2 gap-2' : 'grid'}>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'MENYIMPAN…' : submitLabel}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            BATAL
          </Button>
        )}
      </div>
    </form>
  );
}

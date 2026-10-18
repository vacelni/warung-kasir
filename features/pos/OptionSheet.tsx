'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { MAX_NOTE_LENGTH, unitPriceOf, type CartOption } from '@/lib/cart';
import { cx } from '@/lib/cx';
import { formatRupiah } from '@/lib/money';
import {
  initialSelection,
  missingRequired,
  priceAddition,
  selectedOptions,
  toggleChoice,
  unavailableRequired,
  type CatalogOptionGroup,
  type Selection,
} from '@/lib/options';
import type { CatalogProduct } from './filter';
import { QuantityStepper } from './QuantityStepper';

export type OptionChoiceResult = { options: CartOption[]; note: string; quantity: number };

type OptionSheetProps = {
  /** The product being ordered; null keeps the sheet closed. */
  product: CatalogProduct | null;
  onClose: () => void;
  onConfirm: (product: CatalogProduct, result: OptionChoiceResult) => void;
};

/**
 * The choices for one product, as a bottom sheet over the menu (UI_SPEC A.9a): tap through the
 * groups, see the price add up, then add it to the order. Nothing is sent anywhere; the order
 * is only changed when the cashier confirms.
 */
export function OptionSheet({ product, onClose, onConfirm }: OptionSheetProps) {
  return (
    <Dialog open={product !== null} onClose={onClose} title={product?.name ?? ''}>
      {product && <SheetBody key={product.id} product={product} onConfirm={onConfirm} />}
    </Dialog>
  );
}

/** The footer lives here, not in the Dialog's `actions`, because the Add button reads the selection. */
function SheetBody({ product, onConfirm }: { product: CatalogProduct; onConfirm: OptionSheetProps['onConfirm'] }) {
  const groups = product.optionGroups;
  const [selection, setSelection] = useState<Selection>(() => initialSelection(groups));
  const [note, setNote] = useState('');
  const [quantity, setQuantity] = useState(1);

  const options = selectedOptions(groups, selection);
  const unitPrice = unitPriceOf(product.price, options);
  const missing = missingRequired(groups, selection);
  const soldOut = unavailableRequired(groups);
  const canAdd = missing.length === 0 && soldOut.length === 0;

  function confirm() {
    if (!canAdd) return;
    onConfirm(product, { options, note, quantity });
  }

  return (
    <div className="flex flex-col gap-5">
      {soldOut.length > 0 && (
        <Alert tone="warning">
          {soldOut.map((group) => group.name).join(', ')} sedang habis, jadi menu ini belum bisa dipesan. Hubungi Owner.
        </Alert>
      )}

      {groups.map((group) => (
        <GroupPicker
          key={group.id}
          group={group}
          chosen={selection[group.id] ?? []}
          onToggle={(choiceId) => setSelection((current) => toggleChoice(groups, current, group.id, choiceId))}
        />
      ))}

      <Input
        label="Catatan (opsional)"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={MAX_NOTE_LENGTH}
        placeholder="Contoh: sambal dipisah"
        autoComplete="off"
      />

      <div className="flex items-center justify-between gap-3">
        <span className="text-base font-medium text-foreground">Jumlah</span>
        <QuantityStepper
          name={product.name}
          quantity={quantity}
          onDecrease={() => setQuantity((current) => Math.max(1, current - 1))}
          onIncrease={() => setQuantity((current) => current + 1)}
        />
      </div>

      <div
        className={cx(
          'sticky bottom-0 -mx-5 -mb-5 flex flex-col gap-3 border-t border-border bg-surface px-5 pt-3 pb-5',
          'sm:static sm:mx-0 sm:mb-0 sm:border-0 sm:p-0',
        )}
      >
        {missing.length > 0 && soldOut.length === 0 && (
          <p role="status" className="text-body font-medium text-danger-ink">
            Pilih dulu: {missing.map((group) => group.name).join(', ')}
          </p>
        )}
        <Button onClick={confirm} disabled={!canAdd}>
          TAMBAH · {formatRupiah(unitPrice * quantity)}
        </Button>
      </div>
    </div>
  );
}

type GroupPickerProps = { group: CatalogOptionGroup; chosen: readonly string[]; onToggle: (choiceId: string) => void };

/** One group: its name, whether it is required, and its choices as large toggle buttons. */
function GroupPicker({ group, chosen, onToggle }: GroupPickerProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">
        {group.name}
        <Badge tone={group.required ? 'warning' : 'neutral'}>{group.required ? 'Wajib' : 'Opsional'}</Badge>
        {group.allowMultiple && <span className="text-caption font-normal text-muted">bisa lebih dari satu</span>}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        {group.choices.map((choice) => {
          const selected = chosen.includes(choice.id);
          const extra = priceAddition(choice);
          return (
            <button
              key={choice.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onToggle(choice.id)}
              className={cx(
                'flex min-h-12 flex-col items-start justify-center rounded-control border px-3 py-2 text-left select-none',
                selected
                  ? 'border-primary bg-primary-soft text-primary-ink'
                  : 'border-border-strong bg-surface text-foreground active:bg-subtle',
              )}
            >
              <span className="text-base font-semibold break-words">{choice.name}</span>
              {extra !== null && <span className="text-caption">+{formatRupiah(extra)}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

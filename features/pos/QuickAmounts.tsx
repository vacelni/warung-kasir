import { QUICK_AMOUNTS } from '@/lib/checkout';
import { formatRupiah, type Money } from '@/lib/money';

type QuickAmountsProps = {
  total: Money;
  /** Receives the amount to SET as the paid amount; it never adds to the current value (C20). */
  onSelect: (amount: Money) => void;
  disabled?: boolean;
};

// Narrower side padding than Button so "Rp100.000" fits three per row at 360px; still 48px tall.
const QUICK_BUTTON =
  'flex min-h-12 items-center justify-center rounded-control border border-border-strong bg-surface px-2 ' +
  'text-body font-semibold text-foreground select-none active:bg-subtle hover:bg-subtle ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

/** [Rp10.000] [Rp20.000] [Rp50.000] / [Rp100.000] [Rp200.000] [UANG PAS] (UI_SPEC A.12). */
export function QuickAmounts({ total, onSelect, disabled }: QuickAmountsProps) {
  return (
    <div role="group" aria-label="Nominal cepat" className="grid grid-cols-3 gap-2">
      {QUICK_AMOUNTS.map((amount) => (
        <button key={amount} type="button" disabled={disabled} onClick={() => onSelect(amount)} className={QUICK_BUTTON}>
          {formatRupiah(amount)}
        </button>
      ))}
      <button type="button" disabled={disabled} onClick={() => onSelect(total)} className={QUICK_BUTTON}>
        UANG PAS
      </button>
    </div>
  );
}

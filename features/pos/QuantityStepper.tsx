import { Icon } from '@/components/ui/Icon';

type QuantityStepperProps = {
  /** Product name, used only in the accessible names of the buttons. */
  name: string;
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
};

const STEP_BUTTON =
  'flex h-12 w-12 items-center justify-center rounded-control border border-border-strong bg-surface text-foreground select-none ' +
  'active:bg-subtle disabled:cursor-not-allowed disabled:opacity-40';

/** [-] 2 [+]. Quantity stops at 1 (PRD §13.1); taking the line out is the separate "Hapus" button. */
export function QuantityStepper({ name, quantity, onDecrease, onIncrease }: QuantityStepperProps) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label={`Kurangi ${name}`} disabled={quantity <= 1} onClick={onDecrease} className={STEP_BUTTON}>
        <Icon name="minus" />
      </button>
      <span aria-label={`Jumlah ${quantity}`} className="min-w-10 text-center text-section-title font-bold text-foreground">
        {quantity}
      </span>
      <button type="button" aria-label={`Tambah ${name}`} onClick={onIncrease} className={STEP_BUTTON}>
        <Icon name="plus" />
      </button>
    </div>
  );
}

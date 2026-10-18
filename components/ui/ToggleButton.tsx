import type { ButtonHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

type ToggleButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'aria-pressed'> & { selected: boolean };

/** One button of a "pick one" row: the selected one is outlined in orange. State is also exposed as aria-pressed. */
export function ToggleButton({ selected, className, ...props }: ToggleButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cx(
        'min-h-12 rounded-control border px-4 text-base font-semibold select-none',
        selected ? 'border-primary bg-primary-soft text-primary-ink' : 'border-border-strong bg-surface text-foreground active:bg-subtle',
        className,
      )}
      {...props}
    />
  );
}

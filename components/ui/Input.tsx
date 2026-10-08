import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { cx } from '@/lib/cx';

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  label: string;
  /** Inline validation message; marks the field invalid and is announced with it. */
  error?: string;
  hint?: string;
  /** Control placed inside the right edge of the field, e.g. a show/hide password button. */
  trailing?: ReactNode;
  ref?: Ref<HTMLInputElement>;
};

/** Labelled text field, 48px tall with a 16px font so mobile browsers do not zoom on focus. */
export function Input({ label, error, hint, trailing, id, ref, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  // The hint yields to the error, so only the message actually rendered is referenced.
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-body font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx(
            'min-h-12 w-full rounded-control border border-border-strong bg-surface px-4 text-base text-foreground',
            'placeholder:text-muted/70 disabled:bg-subtle disabled:text-muted',
            error ? 'border-danger' : 'focus:border-primary',
            trailing ? 'pr-14' : undefined,
          )}
          {...props}
        />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center">{trailing}</div>}
      </div>
      {hint && !error && (
        <p id={hintId} className="text-caption text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-caption font-medium text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}

import { useId, type TextareaHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & {
  label: string;
  error?: string;
  hint?: string;
};

/** Labelled multi-line field matching Input: 16px text (no zoom on focus), same border and states. */
export function Textarea({ label, error, hint, id, rows = 3, ...props }: TextareaProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-body font-medium text-foreground">
        {label}
      </label>
      <textarea
        id={fieldId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          'min-h-12 w-full resize-y rounded-control border border-border-strong bg-surface px-4 py-3 text-base text-foreground',
          'placeholder:text-muted/70 disabled:bg-subtle disabled:text-muted',
          error ? 'border-danger' : 'focus:border-primary',
        )}
        {...props}
      />
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

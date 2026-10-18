import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className' | 'children'> & {
  label: ReactNode;
  /** Smaller text under the label. */
  hint?: string;
};

/** A labelled checkbox whose whole row is the touch target (at least 48px tall). */
export function Checkbox({ label, hint, id, ...props }: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <label htmlFor={inputId} className="flex min-h-12 cursor-pointer items-center gap-3 py-1 select-none">
      <input id={inputId} type="checkbox" className="h-6 w-6 shrink-0 accent-primary" {...props} />
      <span className="min-w-0">
        <span className="block text-base text-foreground">{label}</span>
        {hint && <span className="block text-caption text-muted">{hint}</span>}
      </span>
    </label>
  );
}

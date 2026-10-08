import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary';

const BASE =
  'inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-base font-semibold ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

// orange-700 keeps white text above 4.5:1 contrast (PRD §42).
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-orange-700 text-white active:bg-orange-800',
  secondary: 'border border-gray-300 bg-white text-gray-800 active:bg-gray-100',
};

export function buttonClasses(variant: Variant = 'primary', className?: string): string {
  return [BASE, VARIANTS[variant], className].filter(Boolean).join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, className)} {...props} />;
}

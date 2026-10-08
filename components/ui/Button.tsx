import type { ButtonHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'danger-outline';

// 48px minimum height and a 12px radius (UI_SPEC A.6). Focus ring comes from globals.css.
const BASE =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-5 text-base font-semibold ' +
  'select-none disabled:cursor-not-allowed disabled:opacity-50';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white active:bg-primary-hover hover:bg-primary-hover',
  secondary: 'border border-border-strong bg-surface text-foreground active:bg-subtle hover:bg-subtle',
  danger: 'bg-danger text-white active:bg-danger-hover hover:bg-danger-hover',
  'danger-outline': 'border border-danger-border bg-surface text-danger active:bg-danger-soft hover:bg-danger-soft',
};

export function buttonClasses(variant: ButtonVariant = 'primary', className?: string): string {
  return cx(BASE, VARIANTS[variant], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant };

export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, className)} {...props} />;
}

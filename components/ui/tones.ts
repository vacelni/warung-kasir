export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

/** Border, background, and text colors shared by Badge, Alert, and the state panels. */
export const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'border-border-strong bg-subtle text-foreground',
  primary: 'border-primary-border bg-primary-soft text-primary-ink',
  success: 'border-success-border bg-success-soft text-success-ink',
  warning: 'border-warning-border bg-warning-soft text-warning-ink',
  danger: 'border-danger-border bg-danger-soft text-danger-ink',
};

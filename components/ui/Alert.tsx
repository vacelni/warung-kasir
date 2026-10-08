import type { HTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { TONE_CLASSES, type Tone } from './tones';

type AlertProps = HTMLAttributes<HTMLDivElement> & { tone?: Tone };

/** Inline message. Errors are announced immediately (`alert`); everything else politely (`status`). */
export function Alert({ tone = 'neutral', role, className, ...props }: AlertProps) {
  return (
    <div
      role={role ?? (tone === 'danger' ? 'alert' : 'status')}
      className={cx('rounded-control border px-4 py-3 text-body', TONE_CLASSES[tone], className)}
      {...props}
    />
  );
}

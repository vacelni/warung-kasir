import type { HTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { TONE_CLASSES, type Tone } from './tones';

type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: Tone };

/** Short status label. Always carries text, so meaning never depends on color alone (PRD §42). */
export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-caption font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    />
  );
}

import type { HTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Set to false when the content brings its own padding, e.g. a divided list of rows. */
  padded?: boolean;
};

/** Flat white surface with a hairline border; no shadow, so lists of cards stay calm. */
export function Card({ padded = true, className, ...props }: CardProps) {
  return (
    <div
      className={cx('rounded-card border border-border bg-surface', padded && 'p-4', className)}
      {...props}
    />
  );
}

import type { HTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

/** Gray placeholder block that holds a layout slot while data loads. Size it with className. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cx('rounded-control bg-border motion-safe:animate-pulse', className)} {...props} />;
}

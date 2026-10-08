import type { ReactNode } from 'react';

/**
 * Bar fixed above the mobile bottom navigation (offset by --bottom-nav-height) and, from `md`,
 * to the right of the sidebar (w-64). Pages that use it add bottom padding so content is not hidden.
 */
export function DockedBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] z-30 border-t border-border bg-surface shadow-sheet md:bottom-0 md:left-64">
      <div className="mx-auto w-full max-w-5xl px-4 py-3 md:px-8">{children}</div>
    </div>
  );
}

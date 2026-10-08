'use client';

import { ToastProvider } from '@/components/ui/Toast';
import { useProfile } from '@/features/auth/AuthProvider';
import { SyncIndicator } from '@/features/offline/SyncStatus';
import { useSyncAgent } from '@/features/offline/useSyncAgent';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';

/**
 * Frame around every private page: sidebar from `md`, top bar and bottom navigation below it.
 * Rendered inside <AuthGate>, so a profile always exists (TECHNICAL_SPEC C.14).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const profile = useProfile();
  // One sync agent per tab, for the signed-in user (TECHNICAL_SPEC C.12).
  useSyncAgent(profile.id);

  return (
    <ToastProvider>
      <a
        href="#konten"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-3 focus:font-semibold focus:text-primary"
      >
        Lewati ke konten
      </a>
      <div className="min-h-dvh md:flex">
        <Sidebar profile={profile} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface px-4 py-2 md:hidden">
            <div className="min-w-0 flex-1">
              <p className="text-section-title font-bold text-primary">WarungKasir</p>
              <p className="truncate text-caption text-muted">{profile.name}</p>
            </div>
            <SyncIndicator />
          </header>
          <main
            id="konten"
            tabIndex={-1}
            className="flex-1 px-4 pt-4 pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+1rem)] outline-none md:px-8 md:py-8"
          >
            <div className="mx-auto w-full max-w-5xl">{children}</div>
          </main>
        </div>
      </div>
      <BottomNav role={profile.role} />
    </ToastProvider>
  );
}

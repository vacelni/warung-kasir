'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useAuth, useProfile } from '@/features/auth/AuthProvider';

export function AppShell({ children }: { children: React.ReactNode }) {
  const profile = useProfile();
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  // Temporary placement: logout moves to the Lainnya page in Phase 3, and the
  // pending-transaction warning (UI_SPEC A.24) arrives with the outbox.
  async function handleLogout() {
    setLoggingOut(true);
    await logout();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-2">
        <div className="min-w-0">
          <p className="text-lg font-semibold text-orange-700">WarungKasir</p>
          <p className="text-sm break-words text-gray-600">{profile.name}</p>
        </div>
        <Button variant="secondary" onClick={handleLogout} disabled={loggingOut} className="shrink-0">
          Keluar
        </Button>
      </header>
      <main className="flex-1 px-4 py-4">{children}</main>
    </div>
  );
}

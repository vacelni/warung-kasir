'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { loginPath } from './account';
import { useAuth } from './AuthProvider';

/**
 * Client-side guard for every private route (TECHNICAL_SPEC C.3, AC-13). Pages are
 * static and hold no private data; RLS protects the data itself.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { state, retry } = useAuth();
  const router = useRouter();
  const redirectTo = state.status === 'signedOut' ? loginPath(state.reason) : null;

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  switch (state.status) {
    case 'signedIn':
      return children;
    case 'unreachable':
      return (
        <StatusScreen title="Tidak dapat terhubung ke server">
          <p className="text-base text-muted">
            Akun Anda belum dapat diperiksa. Periksa koneksi internet, lalu coba lagi.
          </p>
          <Button onClick={retry} className="w-full">
            COBA LAGI
          </Button>
        </StatusScreen>
      );
    case 'loading':
      return <StatusScreen title="Memuat…" />;
    case 'signedOut':
      return <StatusScreen title="Mengalihkan ke halaman masuk…" />;
  }
}

function StatusScreen({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="flex w-full max-w-sm flex-col gap-4 text-center" role="status">
        {!children && <Spinner size={32} className="mx-auto" />}
        <p className="text-section-title font-semibold text-foreground">{title}</p>
        {children}
      </div>
    </main>
  );
}

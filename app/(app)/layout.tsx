import { AppShell } from '@/components/layout/AppShell';
import { AuthGate } from '@/features/auth/AuthGate';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { RouteAccess } from '@/features/auth/RouteAccess';

// Auth guard + shell for every private route (TECHNICAL_SPEC C.3, C.14).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGate>
        <AppShell>
          <RouteAccess>{children}</RouteAccess>
        </AppShell>
      </AuthGate>
    </AuthProvider>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ErrorState } from '@/components/shared/ErrorState';
import { buttonClasses } from '@/components/ui/Button';
import { canAccessRoute } from '@/lib/permissions';
import { useProfile } from './AuthProvider';

/** Hides owner-only pages from cashiers (UX only; RLS enforces the data rules). */
export function RouteAccess({ children }: { children: React.ReactNode }) {
  const profile = useProfile();
  const pathname = usePathname();

  if (canAccessRoute(profile.role, pathname)) return children;

  return (
    <ErrorState
      headingLevel={1}
      title="Akses ditolak"
      description="Halaman ini hanya dapat dibuka oleh Owner."
      actions={
        <Link href="/kasir" className={buttonClasses('primary', 'w-full')}>
          KEMBALI KE KASIR
        </Link>
      }
    />
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { buttonClasses } from '@/components/ui/Button';
import { canAccessRoute } from '@/lib/permissions';
import { useProfile } from './AuthProvider';

/** Hides owner-only pages from cashiers (UX only; RLS enforces the data rules). */
export function RouteAccess({ children }: { children: React.ReactNode }) {
  const profile = useProfile();
  const pathname = usePathname();

  if (canAccessRoute(profile.role, pathname)) return children;

  return (
    <section className="mx-auto flex max-w-sm flex-col gap-4 py-8 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">Akses ditolak</h1>
      <p className="text-base text-gray-700">Halaman ini hanya dapat dibuka oleh Owner.</p>
      <Link href="/kasir" className={buttonClasses('primary', 'w-full')}>
        KEMBALI KE KASIR
      </Link>
    </section>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/shared/EmptyState';

export const metadata: Metadata = {
  title: 'Halaman tidak ditemukan',
};

/**
 * Replaces Next.js's default 404 page, whose inline `style` attributes the Content-Security-Policy
 * blocks (no 'unsafe-inline', SEC-03). Public: it shows no data.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <EmptyState
        icon="search"
        headingLevel={1}
        title="Halaman tidak ditemukan"
        description="Alamat ini tidak ada di WarungKasir."
        actions={
          <Link href="/kasir" className={buttonClasses('primary', 'w-full')}>
            BUKA KASIR
          </Link>
        }
      />
    </main>
  );
}

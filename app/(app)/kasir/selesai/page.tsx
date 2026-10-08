import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoadingState } from '@/components/shared/LoadingState';
import { CheckoutSuccess } from '@/features/pos/CheckoutSuccess';

export const metadata: Metadata = { title: 'Transaksi Berhasil' };

// The transaction id is a query parameter (?id=), read with useSearchParams, which a static
// export requires inside a Suspense boundary (TECHNICAL_SPEC C.3).
export default function SelesaiPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <CheckoutSuccess />
    </Suspense>
  );
}

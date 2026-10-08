import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoadingState } from '@/components/shared/LoadingState';
import { TransactionDetail } from '@/features/transactions/TransactionDetail';

export const metadata: Metadata = { title: 'Detail Transaksi' };

// The transaction id is a query parameter (?id=), read with useSearchParams, which a static
// export requires inside a Suspense boundary (TECHNICAL_SPEC C.3). No runtime [id] segment.
export default function DetailPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <TransactionDetail />
    </Suspense>
  );
}

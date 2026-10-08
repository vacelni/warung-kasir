import type { Metadata } from 'next';
import { PaymentForm } from '@/features/pos/PaymentForm';

export const metadata: Metadata = { title: 'Pembayaran' };

export default function BayarPage() {
  return <PaymentForm />;
}

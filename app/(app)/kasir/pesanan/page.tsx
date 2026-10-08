import type { Metadata } from 'next';
import { CartList } from '@/features/pos/CartList';

export const metadata: Metadata = { title: 'Pesanan' };

export default function PesananPage() {
  return <CartList />;
}

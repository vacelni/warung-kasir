import type { Metadata } from 'next';
import { ProductPicker } from '@/features/pos/ProductPicker';

export const metadata: Metadata = { title: 'Kasir' };

export default function KasirPage() {
  return <ProductPicker />;
}

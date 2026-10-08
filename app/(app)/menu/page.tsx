import type { Metadata } from 'next';
import { ProductList } from '@/features/products/ProductList';

export const metadata: Metadata = { title: 'Menu' };

export default function Page() {
  return <ProductList />;
}

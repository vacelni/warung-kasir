import type { Metadata } from 'next';
import { CategoryList } from '@/features/categories/CategoryList';

export const metadata: Metadata = { title: 'Kategori' };

export default function Page() {
  return <CategoryList />;
}

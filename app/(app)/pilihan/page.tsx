import type { Metadata } from 'next';
import { OptionGroupList } from '@/features/options/OptionGroupList';

export const metadata: Metadata = { title: 'Pilihan Menu' };

export default function Page() {
  return <OptionGroupList />;
}

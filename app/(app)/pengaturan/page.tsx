import type { Metadata } from 'next';
import { StoreSettings } from '@/features/settings/StoreSettings';

export const metadata: Metadata = { title: 'Pengaturan' };

export default function Page() {
  return <StoreSettings />;
}

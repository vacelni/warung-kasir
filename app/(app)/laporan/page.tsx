import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/shared/PagePlaceholder';

export const metadata: Metadata = { title: 'Laporan' };

export default function Page() {
  return <PagePlaceholder title="Laporan" />;
}

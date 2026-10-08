import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/PageHeader';
import { LainnyaMenu } from '@/features/lainnya/LainnyaMenu';

export const metadata: Metadata = { title: 'Lainnya' };

export default function LainnyaPage() {
  return (
    <>
      <PageHeader title="Lainnya" />
      <LainnyaMenu />
    </>
  );
}

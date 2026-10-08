import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/Card';
import packageJson from '@/package.json';

export const metadata: Metadata = { title: 'Tentang' };

export default function TentangPage() {
  return (
    <>
      <PageHeader title="Tentang" />
      <Card className="flex max-w-xl flex-col gap-2">
        <p className="text-section-title font-bold text-primary">WarungKasir</p>
        <p className="text-base text-foreground">Sistem kasir internal untuk warung makan.</p>
        <p className="text-body text-muted">Versi {packageJson.version}</p>
      </Card>
    </>
  );
}

import type { Metadata } from 'next';
import { ReportDashboard } from '@/features/reports/ReportDashboard';

export const metadata: Metadata = { title: 'Laporan' };

export default function Page() {
  return <ReportDashboard />;
}

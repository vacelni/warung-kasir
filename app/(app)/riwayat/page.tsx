import type { Metadata } from 'next';
import { HistoryList } from '@/features/transactions/HistoryList';

export const metadata: Metadata = { title: 'Riwayat' };

export default function Page() {
  return <HistoryList />;
}

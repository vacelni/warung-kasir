import type { Metadata } from 'next';
import { BackupPage } from '@/features/backup/BackupPage';

export const metadata: Metadata = { title: 'Backup / Export' };

export default function Page() {
  return <BackupPage />;
}

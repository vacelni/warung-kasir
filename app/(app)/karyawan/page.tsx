import type { Metadata } from 'next';
import { CashierList } from '@/features/employees/CashierList';

export const metadata: Metadata = { title: 'Karyawan' };

export default function Page() {
  return <CashierList />;
}

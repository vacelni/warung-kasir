'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { Alert } from '@/components/ui/Alert';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { BackHeader } from '@/features/pos/BackHeader';
import { formatRupiah, type Money } from '@/lib/money';
import { useProfile } from '@/features/auth/AuthProvider';
import { SALE_TIME_FLAG_REASONS, saleTimeFlag } from '@/lib/saleTimeFlag';
import { formatJakartaDate, formatJakartaTime } from '@/lib/time';
import type { TransactionDetail as TransactionDetailData } from './model';
import { StatusBadges } from './StatusBadges';
import { useTransactionDetail } from './useTransactionDetail';

const BACK = { href: '/riwayat', backLabel: 'Kembali ke riwayat', title: 'Detail Transaksi' } as const;

/** Detail of one sale (PRD §20): items as sold, totals, cashier, and sale time in WIB. Opened with ?id=<uuid>. */
export function TransactionDetail() {
  const id = useSearchParams().get('id');
  const { state, retry } = useTransactionDetail(id);

  if (state.status === 'loading') {
    return (
      <>
        <BackHeader {...BACK} />
        <div role="status" aria-label="Memuat transaksi" aria-busy="true" className="flex flex-col gap-3">
          <Skeleton className="h-24 rounded-card" />
          <Skeleton className="h-40 rounded-card" />
        </div>
      </>
    );
  }

  if (state.status === 'notFound') {
    return (
      <>
        <BackHeader {...BACK} />
        <EmptyState
          title="Transaksi tidak ditemukan"
          description="Transaksi ini tidak ada, atau bukan milik akun Anda."
          actions={
            <Link href="/riwayat" className={buttonClasses('primary', 'w-full')}>
              KEMBALI KE RIWAYAT
            </Link>
          }
        />
      </>
    );
  }

  if (state.status === 'error') {
    return (
      <>
        <BackHeader {...BACK} />
        <ErrorState
          title="Transaksi gagal dimuat"
          description="Detail transaksi tidak dapat diambil dari server. Periksa koneksi internet lalu coba lagi."
          actions={<Button onClick={retry}>COBA LAGI</Button>}
        />
      </>
    );
  }

  return (
    <>
      <BackHeader {...BACK} />
      <DetailBody detail={state.detail} />
    </>
  );
}

function DetailBody({ detail }: { detail: TransactionDetailData }) {
  const soldAt = new Date(detail.createdAt);
  // SEC-06: only the owner checks sale times; nothing changes for the cashier.
  const isOwner = useProfile().role === 'owner';
  const timeFlag = isOwner ? saleTimeFlag(detail.createdAt, detail.syncedAt) : null;
  const receivedAt = isOwner && detail.syncedAt ? new Date(detail.syncedAt) : null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <p className="text-section-title font-bold break-all text-foreground">{detail.code}</p>
        <div className="flex">
          <StatusBadges entry={detail} all />
        </div>
      </Card>

      <SyncNotice detail={detail} />
      {timeFlag && (
        <Alert tone="warning">
          <span className="font-semibold">Cek waktu. </span>
          {SALE_TIME_FLAG_REASONS[timeFlag]}
        </Alert>
      )}

      <Card padded={false}>
        <h2 className="px-4 pt-4 text-section-title font-semibold text-foreground">Pesanan</h2>
        <ul className="divide-y divide-border">
          {detail.lines.map((line, index) => (
            <li key={`${line.productName}-${index}`} className="flex items-start justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block text-base font-medium break-words text-foreground">{line.productName}</span>
                <span className="block text-body text-muted">
                  {formatRupiah(line.unitPrice)} × {line.quantity}
                </span>
              </span>
              <span className="shrink-0 text-base font-semibold text-foreground">{formatRupiah(line.subtotal)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <dl className="flex flex-col gap-2">
          <AmountRow label="Total" amount={detail.total} strong />
          <AmountRow label="Bayar" amount={detail.paidAmount} />
          <AmountRow label="Kembalian" amount={detail.changeAmount} />
        </dl>
      </Card>

      <Card>
        <dl className="flex flex-col gap-2">
          <InfoRow label="Kasir" value={detail.cashierName ?? '–'} />
          <InfoRow label="Tanggal" value={formatJakartaDate(soldAt)} />
          <InfoRow label="Waktu" value={`${formatJakartaTime(soldAt)} WIB`} />
          {receivedAt && (
            <InfoRow label="Diterima server" value={`${formatJakartaDate(receivedAt)} ${formatJakartaTime(receivedAt)} WIB`} />
          )}
        </dl>
      </Card>
    </div>
  );
}

/** Explains a sale the server does not have yet. A synced or server-side sale needs no explanation. */
function SyncNotice({ detail }: { detail: TransactionDetailData }) {
  if (detail.syncStatus === 'failed') {
    return (
      <Alert tone="danger">
        Server menolak transaksi ini. Transaksi tetap tersimpan di perangkat ini. Hubungi Owner.
      </Alert>
    );
  }
  if (detail.syncStatus === 'pending' || detail.syncStatus === 'syncing') {
    return (
      <Alert tone="warning">
        Transaksi tersimpan di perangkat dan belum diterima server. Sinkronisasi akan dicoba kembali.
      </Alert>
    );
  }
  return null;
}

function AmountRow({ label, amount, strong = false }: { label: string; amount: Money; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-base text-muted">{label}</dt>
      <dd className={strong ? 'text-section-title font-bold text-foreground' : 'text-base font-semibold text-foreground'}>
        {formatRupiah(amount)}
      </dd>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-base text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-base font-medium break-words text-foreground">{value}</dd>
    </div>
  );
}

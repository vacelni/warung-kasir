'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { LoadingState } from '@/components/shared/LoadingState';
import { SuccessState } from '@/components/shared/SuccessState';
import { Badge } from '@/components/ui/Badge';
import { Button, buttonClasses } from '@/components/ui/Button';
import { useProfile } from '@/features/auth/AuthProvider';
import { getOutboxEntry, type OutboxEntry } from '@/features/offline/outbox';
import { syncOnce } from '@/features/offline/sync';
import { formatRupiah, type Money } from '@/lib/money';
import { useCart } from './CartProvider';

type ScreenState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error' }
  | { status: 'ready'; entry: OutboxEntry; syncing: boolean };

const needsSync = (entry: OutboxEntry) => entry.sync_status === 'pending' || entry.sync_status === 'syncing';

/** The outbox entry, only if it belongs to the signed-in cashier (a device can be shared). */
async function readOwnEntry(id: string, cashierId: string): Promise<OutboxEntry | null> {
  const entry = await getOutboxEntry(id);
  return entry && entry.cashier_id === cashierId ? entry : null;
}

/** Runs one sync, then re-reads the entry. A failed sync never loses the sale; it stays on the device. */
async function syncThenRead(entry: OutboxEntry, cashierId: string): Promise<OutboxEntry> {
  try {
    await syncOnce(cashierId);
  } catch (error) {
    console.error('Sync after checkout failed; the sale stays on this device:', error);
  }
  return (await getOutboxEntry(entry.id)) ?? entry;
}

/**
 * Transaction success (UI_SPEC A.14). Shown once the sale is saved on the device; it then
 * starts the sync ("after checkout", TECHNICAL_SPEC C.12) and shows the current sync status.
 */
export function CheckoutSuccess() {
  const id = useSearchParams().get('id');
  const profile = useProfile();
  const { clear } = useCart();
  const router = useRouter();
  const [state, setState] = useState<ScreenState>({ status: 'loading' });

  // Shows the saved sale, then syncs it if it still needs it and shows the result.
  useEffect(() => {
    if (!id) return;
    let active = true;
    readOwnEntry(id, profile.id)
      .then((entry) => {
        if (!active) return;
        if (!entry) {
          setState({ status: 'missing' });
          return;
        }
        setState({ status: 'ready', entry, syncing: needsSync(entry) });
        if (!needsSync(entry)) return;
        return syncThenRead(entry, profile.id).then((after) => {
          if (active) setState({ status: 'ready', entry: after, syncing: false });
        });
      })
      .catch((error: unknown) => {
        console.error('Could not read the saved transaction:', error);
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [id, profile.id]);

  function retrySync() {
    if (state.status !== 'ready') return;
    setState({ ...state, syncing: true });
    syncThenRead(state.entry, profile.id)
      .then((after) => setState({ status: 'ready', entry: after, syncing: false }))
      .catch((error: unknown) => {
        console.error('Could not read the saved transaction:', error);
        setState({ status: 'error' });
      });
  }

  function newTransaction() {
    clear();
    router.push('/kasir');
  }

  const newTransactionButton = (
    <Button className="w-full" onClick={newTransaction}>
      TRANSAKSI BARU
    </Button>
  );

  if (!id || state.status === 'missing') {
    return (
      <EmptyState
        headingLevel={1}
        title="Transaksi tidak ditemukan"
        description="Transaksi ini tidak ada di perangkat ini."
        actions={newTransactionButton}
      />
    );
  }

  if (state.status === 'loading') return <LoadingState label="Memuat transaksi…" />;

  if (state.status === 'error') {
    return (
      <ErrorState
        headingLevel={1}
        title="Ringkasan transaksi gagal dimuat"
        description="Penyimpanan perangkat tidak dapat dibaca. Transaksi yang sudah tersimpan tidak terhapus."
        actions={
          <Link href="/kasir" className={buttonClasses('primary', 'w-full')} onClick={clear}>
            TRANSAKSI BARU
          </Link>
        }
      />
    );
  }

  const { entry, syncing } = state;

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <SuccessState headingLevel={1} title="Transaksi Berhasil" description={entry.code} />

      <dl className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
        <SummaryRow label="Total" amount={entry.total} />
        <SummaryRow label="Dibayar" amount={entry.paid_amount} />
        <SummaryRow label="Kembalian" amount={entry.change_amount} emphasis />
      </dl>

      <SyncLine entry={entry} syncing={syncing} />

      <div className="flex flex-col gap-3">
        {newTransactionButton}
        {!syncing && entry.sync_status === 'pending' && (
          <Button variant="secondary" className="w-full" onClick={retrySync}>
            COBA LAGI
          </Button>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, amount, emphasis }: { label: string; amount: Money; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-base text-muted">{label}</dt>
      <dd className={emphasis ? 'text-page-title font-bold text-foreground' : 'text-section-title font-semibold text-foreground'}>
        {formatRupiah(amount)}
      </dd>
    </div>
  );
}

/** Sync status of this sale (A.14). Always text, never color alone (PRD §42). */
function SyncLine({ entry, syncing }: { entry: OutboxEntry; syncing: boolean }) {
  if (syncing) {
    return (
      <p role="status" className="flex justify-center">
        <Badge tone="warning">Tersimpan • Menyinkronkan…</Badge>
      </p>
    );
  }
  switch (entry.sync_status) {
    case 'synced':
      return (
        <p role="status" className="flex justify-center">
          <Badge tone="success">Tersinkron</Badge>
        </p>
      );
    case 'failed':
      return (
        <div role="status" className="flex flex-col items-center gap-2 text-center">
          <Badge tone="danger">Gagal sinkron</Badge>
          <p className="text-body text-muted">
            Server menolak transaksi ini. Transaksi tetap tersimpan di perangkat ini. Hubungi Owner.
          </p>
        </div>
      );
    default:
      return (
        <div role="status" className="flex flex-col items-center gap-2 text-center">
          <Badge tone="warning">Tersimpan • Menunggu sinkronisasi</Badge>
          {entry.last_error && (
            <p className="text-body text-muted">
              Transaksi tersimpan di perangkat. Sinkronisasi akan dicoba kembali.
            </p>
          )}
        </div>
      );
  }
}

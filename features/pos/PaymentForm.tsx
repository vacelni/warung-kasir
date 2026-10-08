'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingState } from '@/components/shared/LoadingState';
import { Alert } from '@/components/ui/Alert';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useProfile } from '@/features/auth/AuthProvider';
import { enqueueTransaction } from '@/features/offline/outbox';
import {
  buildTransaction,
  checkPayment,
  createCheckoutId,
  formatAmountInput,
  parseAmountInput,
  shortfallMessage,
} from '@/lib/checkout';
import { isQuotaError } from '@/lib/idb';
import { formatRupiah, type Money } from '@/lib/money';
import { BackHeader } from './BackHeader';
import { useCart } from './CartProvider';
import { QuickAmounts } from './QuickAmounts';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'full';

/**
 * Payment screen (UI_SPEC A.12–A.13). BAYAR writes the sale to the device outbox, the only
 * checkout write path (decision C31), then opens the success screen, which starts the sync.
 */
export function PaymentForm() {
  const { cart, total, itemCount, clear } = useCart();
  const profile = useProfile();
  const router = useRouter();
  const shortfallId = useId();

  // One identity per checkout: created when this screen opens, reused by every retry (C.8).
  const [checkoutId] = useState(createCheckoutId);
  // Sale time: fixed at the first BAYAR press, so a retry sends the same created_at (D4).
  const saleTime = useRef<Date | null>(null);
  // Synchronous guard: a double tap fires twice before React re-renders the disabled button.
  const submitting = useRef(false);

  const [paid, setPaid] = useState<Money | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const payment = checkPayment(total, paid);

  // Load the success screen ahead of time; it must open even if the network drops meanwhile.
  useEffect(() => {
    router.prefetch('/kasir/selesai');
  }, [router]);

  function changePaid(text: string) {
    const input = parseAmountInput(text);
    if (input.ok) setPaid(input.amount);
  }

  async function pay() {
    if (submitting.current || payment.status !== 'ok' || paid === null) return;
    submitting.current = true;
    setSaveStatus('saving');
    saleTime.current ??= new Date();

    try {
      const sale = buildTransaction({
        id: checkoutId,
        createdAt: saleTime.current,
        cart,
        paid,
        cashierId: profile.id,
        storeId: profile.storeId,
      });
      await enqueueTransaction(sale);
    } catch (error) {
      console.error('Could not save the transaction on this device:', error);
      // Not saved: never show success, never clear the order; the cashier can try again.
      submitting.current = false;
      setSaveStatus(isQuotaError(error) ? 'full' : 'error');
      return;
    }

    // Saved on the device: this order is done. Clearing now means Back can never resubmit it.
    setSaveStatus('saved');
    clear();
    router.replace(`/kasir/selesai?id=${checkoutId}`);
  }

  // The cart is already cleared; show where we are until the success screen opens.
  if (saveStatus === 'saved') return <LoadingState label="Transaksi tersimpan. Membuka ringkasan…" />;

  const busy = saveStatus === 'saving';

  if (cart.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <BackHeader href="/kasir/pesanan" backLabel="Kembali ke pesanan" title="Pembayaran" />
        <EmptyState
          icon="cart"
          title="Keranjang masih kosong."
          description="Pilih menu untuk memulai pesanan."
          actions={
            <Link href="/kasir" className={buttonClasses('primary', 'w-full')}>
              PILIH MENU
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <BackHeader href="/kasir/pesanan" backLabel="Kembali ke pesanan" title="Pembayaran" />

      <div className="flex flex-col gap-5">
        <section aria-label="Total" className="rounded-card border border-border bg-surface px-4 py-3 text-center">
          <p className="text-caption font-semibold tracking-wide text-muted uppercase">Total · {itemCount} item</p>
          <p className="text-page-title font-bold text-foreground">{formatRupiah(total)}</p>
        </section>

        <div className="flex flex-col gap-3">
          <Input
            label="Uang diterima"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            placeholder="Rp0"
            value={formatAmountInput(paid)}
            onChange={(event) => changePaid(event.target.value)}
            // Enter only closes the keyboard; paying is always a deliberate BAYAR tap.
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            disabled={busy}
            aria-invalid={payment.status === 'short' ? true : undefined}
            aria-describedby={payment.status === 'short' ? shortfallId : undefined}
          />
          <QuickAmounts total={total} onSelect={setPaid} disabled={busy} />
        </div>

        {payment.status === 'short' ? (
          <Alert tone="danger" role="status" id={shortfallId}>
            <p className="font-semibold">{shortfallMessage(payment.shortfall)}</p>
            <dl className="mt-2 flex flex-col gap-1">
              <AmountRow label="Total" amount={total} />
              <AmountRow label="Dibayar" amount={paid ?? 0} />
              <AmountRow label="Kurang" amount={payment.shortfall} emphasis />
            </dl>
          </Alert>
        ) : (
          <section aria-label="Kembalian" className="flex items-baseline justify-between gap-3">
            <p className="text-caption font-semibold tracking-wide text-muted uppercase">Kembalian</p>
            <p className="text-page-title font-bold text-foreground">
              {payment.status === 'ok' ? formatRupiah(payment.change) : '–'}
            </p>
          </section>
        )}

        {saveStatus === 'error' && (
          <Alert tone="danger">
            Gagal menyimpan transaksi di perangkat ini. Transaksi belum tersimpan. Tekan BAYAR untuk mencoba lagi.
          </Alert>
        )}
        {saveStatus === 'full' && (
          <Alert tone="danger">
            Penyimpanan perangkat penuh. Transaksi belum tersimpan. Kosongkan ruang penyimpanan HP (hapus file atau
            aplikasi yang tidak dipakai), lalu tekan BAYAR lagi.
          </Alert>
        )}

        <Button className="w-full" disabled={payment.status !== 'ok' || busy} onClick={() => void pay()}>
          {busy ? (
            <>
              <Spinner size={20} className="text-white" />
              MENYIMPAN…
            </>
          ) : (
            'BAYAR'
          )}
        </Button>
      </div>
    </div>
  );
}

function AmountRow({ label, amount, emphasis }: { label: string; amount: Money; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt>{label}</dt>
      <dd className={emphasis ? 'font-bold' : undefined}>{formatRupiah(amount)}</dd>
    </div>
  );
}

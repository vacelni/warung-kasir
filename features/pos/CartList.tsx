'use client';

import Link from 'next/link';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { itemSubtotal } from '@/lib/cart';
import { formatRupiah } from '@/lib/money';
import { useCart } from './CartProvider';
import { DockedBar } from './DockedBar';
import { QuantityStepper } from './QuantityStepper';

/** The order: lines with quantity controls, subtotal, total (UI_SPEC A.11). Every change is local. */
export function CartList() {
  const { cart, total, itemCount, increase, decrease, remove, clear } = useCart();
  const [confirmingClear, setConfirmingClear] = useState(false);

  function confirmClear() {
    clear();
    setConfirmingClear(false);
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-4 flex items-center gap-1">
        <Link
          href="/kasir"
          aria-label="Kembali ke menu"
          className="-ml-3 flex h-12 w-12 shrink-0 items-center justify-center rounded-control text-foreground active:bg-subtle"
        >
          <Icon name="chevronLeft" />
        </Link>
        <h1 className="min-w-0 flex-1 text-page-title font-bold text-foreground">Pesanan</h1>
      </div>

      {cart.length === 0 ? (
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
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {cart.map((item) => (
              <li key={item.productId} className="rounded-card border border-border bg-surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold break-words text-foreground">{item.name}</p>
                    <p className="text-body text-muted">{formatRupiah(item.unitPrice)}</p>
                  </div>
                  <Button
                    variant="danger-outline"
                    className="shrink-0 px-4"
                    aria-label={`Hapus ${item.name}`}
                    onClick={() => remove(item.productId)}
                  >
                    Hapus
                  </Button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <QuantityStepper
                    name={item.name}
                    quantity={item.quantity}
                    onDecrease={() => decrease(item.productId)}
                    onIncrease={() => increase(item.productId)}
                  />
                  <p className="text-right text-price font-bold text-foreground">
                    <span className="sr-only">Subtotal </span>
                    {formatRupiah(itemSubtotal(item))}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {/* Kept away from the pay button on purpose (UI_SPEC A.6). */}
          <Button variant="secondary" className="mt-4 w-full text-danger" onClick={() => setConfirmingClear(true)}>
            KOSONGKAN PESANAN
          </Button>

          {/* Keeps the last line clear of the docked summary. */}
          <div aria-hidden="true" className="h-44" />
          <DockedBar>
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
              <dl className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3 text-body text-muted">
                  <dt>Subtotal ({itemCount} item)</dt>
                  <dd>{formatRupiah(total)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-base font-semibold text-foreground">Total</dt>
                  <dd className="text-page-title font-bold text-foreground">{formatRupiah(total)}</dd>
                </div>
              </dl>
              {/* Payment is built in the next phase (checkout + outbox); there is no page to open yet. */}
              <Button disabled className="w-full">
                LANJUT BAYAR
              </Button>
            </div>
          </DockedBar>
        </>
      )}

      <Dialog
        open={confirmingClear}
        onClose={() => setConfirmingClear(false)}
        title="Kosongkan pesanan?"
        description={`${itemCount} item akan dihapus dari pesanan ini.`}
        actions={
          <>
            <Button variant="danger" onClick={confirmClear}>
              KOSONGKAN
            </Button>
            <Button variant="secondary" data-autofocus onClick={() => setConfirmingClear(false)}>
              BATAL
            </Button>
          </>
        }
      />
    </div>
  );
}

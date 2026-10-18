'use client';

import Link from 'next/link';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { itemSubtotal, type CartItem } from '@/lib/cart';
import { formatRupiah } from '@/lib/money';
import { summarizeOptions } from '@/lib/options';
import { BackHeader } from './BackHeader';
import { useCart } from './CartProvider';
import { DockedBar } from './DockedBar';
import { QuantityStepper } from './QuantityStepper';

/** Name of a line for screen readers: the product plus its choices ("Geprek, Pakai nasi · Level 3"). */
function lineLabel(item: CartItem): string {
  return item.options.length > 0 ? `${item.name}, ${summarizeOptions(item.options)}` : item.name;
}

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
      <BackHeader href="/kasir" backLabel="Kembali ke menu" title="Pesanan" />

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
            {cart.map((item) => {
              // Two lines of one product differ by their choices, so the label must say which one.
              const label = lineLabel(item);
              return (
              <li key={item.lineId} className="rounded-card border border-border bg-surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold break-words text-foreground">{item.name}</p>
                    {item.options.length > 0 && (
                      <p className="text-body break-words text-foreground">{summarizeOptions(item.options)}</p>
                    )}
                    {item.note && <p className="text-body break-words text-muted">Catatan: {item.note}</p>}
                    <p className="text-body text-muted">{formatRupiah(item.unitPrice)}</p>
                  </div>
                  <Button
                    variant="danger-outline"
                    className="shrink-0 px-4"
                    aria-label={`Hapus ${label}`}
                    onClick={() => remove(item.lineId)}
                  >
                    Hapus
                  </Button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <QuantityStepper
                    name={label}
                    quantity={item.quantity}
                    onDecrease={() => decrease(item.lineId)}
                    onIncrease={() => increase(item.lineId)}
                  />
                  <p className="text-right text-price font-bold text-foreground">
                    <span className="sr-only">Subtotal </span>
                    {formatRupiah(itemSubtotal(item))}
                  </p>
                </div>
              </li>
              );
            })}
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
              <Link href="/kasir/bayar" className={buttonClasses('primary', 'w-full')}>
                LANJUT BAYAR
              </Link>
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

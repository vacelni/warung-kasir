import { formatRupiah } from '@/lib/money';
import { summarizeOptions } from '@/lib/options';
import { formatJakartaDate, formatJakartaTime } from '@/lib/time';
import type { StoreProfile } from '@/features/settings/validation';
import type { TransactionDetail } from './model';

/**
 * Simple on-screen receipt (PRD §44, UI_SPEC A.15): what the customer may want to see. No printing.
 * Only the store fields that are filled in are shown.
 */
export function ReceiptView({ detail, store }: { detail: TransactionDetail; store: StoreProfile | null }) {
  const soldAt = new Date(detail.createdAt);
  return (
    <section aria-label="Struk" className="mx-auto flex w-full max-w-sm flex-col gap-3 rounded-card border border-border bg-surface p-5 text-foreground">
      {store && (
        <header className="flex flex-col items-center gap-1 text-center">
          <p className="text-section-title font-bold break-words">{store.name}</p>
          {store.address && <p className="text-body break-words whitespace-pre-line text-muted">{store.address}</p>}
          {store.phone && <p className="text-body text-muted">{store.phone}</p>}
        </header>
      )}

      <dl className="flex flex-col gap-1 border-t border-dashed border-border-strong pt-3 text-body">
        <ReceiptRow label="Kode" value={detail.code} />
        <ReceiptRow label="Tanggal" value={`${formatJakartaDate(soldAt)} ${formatJakartaTime(soldAt)} WIB`} />
        <ReceiptRow label="Kasir" value={detail.cashierName ?? '–'} />
      </dl>

      <ul className="flex flex-col gap-2 border-t border-dashed border-border-strong pt-3">
        {detail.lines.map((line, index) => (
          <li key={`${line.productName}-${index}`} className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-base break-words">{line.productName}</span>
              {line.options.length > 0 && (
                <span className="block text-body break-words">{summarizeOptions(line.options)}</span>
              )}
              {line.note && <span className="block text-body break-words text-muted">Catatan: {line.note}</span>}
              <span className="block text-body text-muted">
                {line.quantity} × {formatRupiah(line.unitPrice)}
              </span>
            </span>
            <span className="shrink-0 text-base">{formatRupiah(line.subtotal)}</span>
          </li>
        ))}
      </ul>

      <dl className="flex flex-col gap-1 border-t border-dashed border-border-strong pt-3">
        <ReceiptRow label="Total" value={formatRupiah(detail.total)} strong />
        <ReceiptRow label="Bayar" value={formatRupiah(detail.paidAmount)} />
        <ReceiptRow label="Kembalian" value={formatRupiah(detail.changeAmount)} />
      </dl>

      {store?.receiptNote && (
        <p className="border-t border-dashed border-border-strong pt-3 text-center text-body break-words whitespace-pre-line">
          {store.receiptNote}
        </p>
      )}
    </section>
  );
}

function ReceiptRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? 'font-bold' : 'text-muted'}>{label}</dt>
      <dd className={`min-w-0 text-right break-words ${strong ? 'text-price font-bold' : ''}`}>{value}</dd>
    </div>
  );
}

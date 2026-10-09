import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { formatRupiah } from '@/lib/money';
import { saleTimeFlag } from '@/lib/saleTimeFlag';
import { formatJakartaTime } from '@/lib/time';
import { StatusBadges } from './StatusBadges';
import type { HistoryEntry } from './model';

/**
 * One sale in the history list (UI_SPEC A.15). The whole card opens the detail page.
 * `showTimeFlag`: the owner sees "Cek waktu" on a sale whose time needs checking (SEC-06).
 */
export function TransactionCard({ entry, showTimeFlag = false }: { entry: HistoryEntry; showTimeFlag?: boolean }) {
  const timeFlagged = showTimeFlag && saleTimeFlag(entry.createdAt, entry.syncedAt) !== null;
  return (
    <Link
      href={`/riwayat/detail?id=${entry.id}`}
      className="flex min-h-14 flex-col gap-1 rounded-card border border-border bg-surface p-4 text-foreground active:bg-subtle hover:bg-subtle"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-base font-semibold break-all">{entry.code}</span>
        <span className="shrink-0 text-price font-bold">{formatRupiah(entry.total)}</span>
      </span>
      <span className="text-body text-muted">
        {formatJakartaTime(new Date(entry.createdAt))} • {entry.itemCount} item
      </span>
      <span className="mt-1 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-body text-muted">Kasir: {entry.cashierName ?? '–'}</span>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {timeFlagged && <Badge tone="warning">Cek waktu</Badge>}
          <StatusBadges entry={entry} />
        </span>
      </span>
    </Link>
  );
}

import Link from 'next/link';
import { formatRupiah } from '@/lib/money';
import { formatJakartaTime } from '@/lib/time';
import { StatusBadges } from './StatusBadges';
import type { HistoryEntry } from './model';

/** One sale in the history list (UI_SPEC A.15). The whole card opens the detail page. */
export function TransactionCard({ entry }: { entry: HistoryEntry }) {
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
        <StatusBadges entry={entry} />
      </span>
    </Link>
  );
}

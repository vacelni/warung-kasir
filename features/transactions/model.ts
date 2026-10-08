import type { OutboxEntry, SyncStatus } from '@/features/offline/outbox';
import type { Money } from '@/lib/money';
import { formatJakartaDay, jakartaDateKey } from '@/lib/time';
import type { HistoryOrder } from './filters';

/** Business status on the server (decision D3). `cancelled` is reserved; the MVP has no cancel UI. */
export type ServerStatus = 'completed' | 'cancelled';

export function isServerStatus(value: string): value is ServerStatus {
  return value === 'completed' || value === 'cancelled';
}

/**
 * One sale in the history list, whether it came from the server or from this device's outbox.
 * The server status and the device sync status are separate fields (decision D3): a row from
 * the server has `serverStatus` and no `syncStatus`; a row from the outbox is the opposite.
 */
export type HistoryEntry = {
  /** The real identity (UUID). Merging and linking use this, never the code. */
  id: string;
  /** Display code TRX-YYYYMMDD-XXXXXX. For people to read and search; not unique. */
  code: string;
  /** Sale time as sent by the device (ISO 8601). Kept as the original string so a paging cursor never loses precision. */
  createdAt: string;
  total: Money;
  paidAmount: Money;
  changeAmount: Money;
  cashierId: string;
  /** Null when the name is not known (a profile that cannot be read). */
  cashierName: string | null;
  /** Total units sold (Nasi Goreng ×2 + Es Teh ×2 = 4), the same count the cart shows. */
  itemCount: number;
  source: 'server' | 'local';
  serverStatus: ServerStatus | null;
  syncStatus: SyncStatus | null;
};

/** One sold line, as frozen at the moment of sale (DATABASE D.7). */
export type DetailLine = {
  productName: string;
  unitPrice: Money;
  quantity: number;
  subtotal: Money;
};

export type TransactionDetail = HistoryEntry & { lines: DetailLine[] };

export function countUnits(lines: readonly { quantity: number }[]): number {
  return lines.reduce((count, line) => count + line.quantity, 0);
}

/** Lines in a stable order. The server keeps no cart position, so both sources sort by name. */
export function sortLines(lines: readonly DetailLine[]): DetailLine[] {
  return [...lines].sort((a, b) => a.productName.localeCompare(b.productName, 'id') || a.unitPrice - b.unitPrice);
}

/** Not yet confirmed by the server: waiting, being sent, or rejected. These must stay visible. */
export function isUnsynced(entry: HistoryEntry): boolean {
  return entry.syncStatus === 'pending' || entry.syncStatus === 'syncing' || entry.syncStatus === 'failed';
}

/** An outbox entry as a history row. `cashierName` is the signed-in user's name: only their own sales are read. */
export function fromOutbox(entry: OutboxEntry, cashierName: string): HistoryEntry {
  return {
    id: entry.id,
    code: entry.code,
    createdAt: entry.created_at,
    total: entry.total,
    paidAmount: entry.paid_amount,
    changeAmount: entry.change_amount,
    cashierId: entry.cashier_id,
    cashierName,
    itemCount: countUnits(entry.items),
    source: 'local',
    serverStatus: null,
    syncStatus: entry.sync_status,
  };
}

/** An outbox entry as a detail page, from its own snapshot; nothing is read from the catalog. */
export function detailFromOutbox(entry: OutboxEntry, cashierName: string): TransactionDetail {
  return {
    ...fromOutbox(entry, cashierName),
    lines: sortLines(
      entry.items.map((item) => ({
        productName: item.product_name,
        unitPrice: item.unit_price,
        quantity: item.quantity,
        subtotal: item.subtotal,
      })),
    ),
  };
}

/** Orders by sale time, then id, so equal times keep a fixed order (the server query uses the same two keys). */
function compareEntries(a: HistoryEntry, b: HistoryEntry, order: HistoryOrder): number {
  const byTime = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  const ascending = byTime !== 0 ? byTime : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return order === 'newest' ? -ascending : ascending;
}

export type MergeInput = {
  /** Server rows loaded so far, already in `order`. */
  server: readonly HistoryEntry[];
  /** This device's own sales that match the active filters. */
  local: readonly HistoryEntry[];
  order: HistoryOrder;
  /** True while the server has rows beyond the ones loaded. */
  hasMore: boolean;
};

/**
 * The history list: server rows plus this device's own sales, deduplicated by UUID.
 *
 * - A sale the server already has is shown from the server row, whatever the outbox says.
 *   So when sync finishes, the local copy simply stops being shown and the list converges
 *   without a duplicate (never matched by code, time, or amount).
 * - A sale the server does not have yet (pending, syncing, failed) is always shown.
 * - A local copy of a synced sale is shown only inside the loaded server window, so an old
 *   sale never appears out of order ahead of server pages that are not loaded yet.
 */
export function mergeHistory({ server, local, order, hasMore }: MergeInput): HistoryEntry[] {
  const serverIds = new Set(server.map((entry) => entry.id));
  const boundary = server.at(-1);

  const extras = local
    .filter((entry) => {
      if (serverIds.has(entry.id)) return false;
      if (isUnsynced(entry) || !hasMore || !boundary) return true;
      // Inside the window: at or after the oldest loaded row (newest first), or at or before it (oldest first).
      return compareEntries(entry, boundary, order) <= 0;
    })
    .sort((a, b) => compareEntries(a, b, order));

  // Classic merge of two sorted lists; the server rows keep exactly the order the database gave.
  const merged: HistoryEntry[] = [];
  let s = 0;
  let l = 0;
  while (s < server.length && l < extras.length) {
    const fromServer = compareEntries(server[s]!, extras[l]!, order) <= 0;
    merged.push(fromServer ? server[s++]! : extras[l++]!);
  }
  return merged.concat(server.slice(s), extras.slice(l));
}

export type DayGroup = { dayKey: string; label: string; entries: HistoryEntry[] };

/** Groups a sorted list by Asia/Jakarta day (TECHNICAL_SPEC C.13). Order is preserved. */
export function groupByDay(entries: readonly HistoryEntry[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const entry of entries) {
    const instant = new Date(entry.createdAt);
    const dayKey = jakartaDateKey(instant);
    const last = groups.at(-1);
    if (last?.dayKey === dayKey) {
      last.entries.push(entry);
    } else {
      groups.push({ dayKey, label: formatJakartaDay(instant), entries: [entry] });
    }
  }
  return groups;
}

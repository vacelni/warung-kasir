import type { OptionSnapshot } from '@/lib/checkout';
import { getSupabase } from '@/lib/supabase';
import type { DateRange, HistoryOrder } from './filters';
import {
  countUnits,
  isServerStatus,
  sortLines,
  type HistoryEntry,
  type TransactionDetail,
} from './model';

/** Rows per history page (progressive loading). One extra row is requested to learn whether more exist. */
export const PAGE_SIZE = 20;

/** Where the next page starts: the sale time (exactly as the database returned it) and id of the last row. */
export type Cursor = { createdAt: string; id: string };

export type HistoryQuery = {
  /** Already normalized by `normalizeSearch`; empty for no search. */
  search: string;
  range: DateRange;
  order: HistoryOrder;
  /**
   * Set for a cashier. RLS already limits a cashier to their own sales (decision D1); sending the
   * same filter keeps the query honest about its scope and avoids asking for rows that would be
   * hidden anyway. An owner passes null and reads the whole store.
   */
  cashierId: string | null;
  after: Cursor | null;
};

export type HistoryPage = { entries: HistoryEntry[]; next: Cursor | null };

// Single string literals on purpose: supabase-js derives the row type from the literal text.
// The cashier name comes from the profile embed; a list page carries only item quantities (to
// count units), never product names or prices.
const LIST_COLUMNS =
  'id, code, cashier_id, total, paid_amount, change_amount, status, created_at, synced_at, cashier:profiles!transactions_cashier_id_fkey(name), transaction_items(quantity)';

const DETAIL_COLUMNS =
  'id, code, cashier_id, total, paid_amount, change_amount, status, created_at, synced_at, cashier:profiles!transactions_cashier_id_fkey(name), transaction_items(product_name, unit_price, quantity, subtotal, options, note)';

type BaseRow = {
  id: string;
  code: string;
  cashier_id: string;
  total: number;
  paid_amount: number;
  change_amount: number;
  status: string;
  created_at: string;
  synced_at: string;
  cashier: { name: string } | null;
};

function toEntry(row: BaseRow, itemCount: number): HistoryEntry {
  if (!isServerStatus(row.status)) throw new Error(`Transaction ${row.id} has an unknown status "${row.status}".`);
  return {
    id: row.id,
    code: row.code,
    createdAt: row.created_at,
    total: row.total,
    paidAmount: row.paid_amount,
    changeAmount: row.change_amount,
    cashierId: row.cashier_id,
    cashierName: row.cashier?.name ?? null,
    itemCount,
    source: 'server',
    serverStatus: row.status,
    syncStatus: null,
    syncedAt: row.synced_at,
  };
}

/**
 * One page of the store's history, keyset-paged on (created_at, id). Unlike an offset, a cursor
 * never repeats or skips a row when a sale is synced between two page loads.
 */
export async function listTransactions(query: HistoryQuery): Promise<HistoryPage> {
  const ascending = query.order === 'oldest';

  let request = getSupabase().from('transactions').select(LIST_COLUMNS);
  if (query.cashierId) request = request.eq('cashier_id', query.cashierId);
  if (query.range.from) request = request.gte('created_at', query.range.from);
  if (query.range.to) request = request.lt('created_at', query.range.to);
  if (query.search) request = request.ilike('code', `%${query.search}%`);
  if (query.after) {
    const { createdAt, id } = query.after;
    const past = ascending ? 'gt' : 'lt';
    request = request.or(`created_at.${past}.${createdAt},and(created_at.eq.${createdAt},id.${past}.${id})`);
  }

  // No automatic retry: it would hold an offline user on the loading state for ~7 seconds (three
  // backed-off GETs) before this device's own sales show. The screen offers COBA LAGI instead.
  const { data, error } = await request
    .retry(false)
    .order('created_at', { ascending })
    .order('id', { ascending })
    .limit(PAGE_SIZE + 1);
  if (error) throw new Error(`Could not load the transaction history: ${error.message}`);

  const hasMore = data.length > PAGE_SIZE;
  const rows = data.slice(0, PAGE_SIZE);
  const entries = rows.map((row) => toEntry(row, countUnits(row.transaction_items)));
  const last = entries.at(-1);
  return { entries, next: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null };
}

/**
 * The options column is JSON written by create_transaction (validated there). Anything that does
 * not have the expected shape is skipped rather than shown wrongly, so one bad row cannot break
 * the whole detail page.
 */
export function parseOptionSnapshots(value: unknown): OptionSnapshot[] {
  if (!Array.isArray(value)) return [];
  const options: OptionSnapshot[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { group, name, price } = entry as Record<string, unknown>;
    if (typeof group === 'string' && typeof name === 'string' && typeof price === 'number') {
      options.push({ group, name, price });
    }
  }
  return options;
}

/**
 * One transaction with its item snapshot, or null when the database has no such row visible to the
 * caller (it does not exist, belongs to another store, or is another cashier's).
 */
export async function getTransaction(id: string): Promise<TransactionDetail | null> {
  // No automatic retry, for the same reason as the list: offline, the device copy must open at once.
  const { data, error } = await getSupabase()
    .from('transactions')
    .select(DETAIL_COLUMNS)
    .eq('id', id)
    .retry(false)
    .maybeSingle();
  if (error) throw new Error(`Could not load the transaction: ${error.message}`);
  if (!data) return null;

  const lines = sortLines(
    data.transaction_items.map((item) => ({
      productName: item.product_name,
      unitPrice: item.unit_price,
      quantity: item.quantity,
      subtotal: item.subtotal,
      options: parseOptionSnapshots(item.options),
      note: item.note,
    })),
  );
  return { ...toEntry(data, countUnits(lines)), lines };
}

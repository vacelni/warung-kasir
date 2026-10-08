import { getSupabase } from '@/lib/supabase';
import { listSyncable, markNotSynced, markSynced, markSyncing, type OutboxEntry } from './outbox';

/** A hung request counts as a network failure and the sale stays pending (TECHNICAL_SPEC C.12). */
const RPC_TIMEOUT_MS = 15_000;

type RpcError = { code?: string; message: string };

export type SyncErrorKind = 'transient' | 'permanent';

/**
 * Permanent: create_transaction rejected the sale (WK001) or the account is not active (WK002),
 * or PostgreSQL reported a data/integrity error (classes 22, 23); resending cannot help, so the
 * entry becomes `failed` and stays on the device. Everything else (network, timeout, 5xx, an
 * expired or missing session, a function not deployed yet) may succeed later, so it stays `pending`.
 */
export function classifySyncError(error: RpcError): SyncErrorKind {
  return /^(WK|22|23)/.test(error.code ?? '') ? 'permanent' : 'transient';
}

type SendResult = { ok: true } | { ok: false; error: RpcError };

/** One create_transaction call. 'created' and 'exists' both mean the server has the sale. */
async function sendTransaction(entry: OutboxEntry): Promise<SendResult> {
  try {
    const { data, error } = await getSupabase()
      .rpc('create_transaction', {
        p_id: entry.id,
        p_code: entry.code,
        p_created_at: entry.created_at,
        p_total: entry.total,
        p_paid_amount: entry.paid_amount,
        p_change_amount: entry.change_amount,
        p_items: entry.items.map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          unit_price: item.unit_price,
          quantity: item.quantity,
          subtotal: item.subtotal,
        })),
      })
      .abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
    if (error) return { ok: false, error };
    if (data === 'created' || data === 'exists') return { ok: true };
    return { ok: false, error: { message: `Unexpected create_transaction result: ${JSON.stringify(data)}` } };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}

function errorText(error: RpcError): string {
  return error.code ? `${error.code}: ${error.message}` : error.message;
}

export type SyncResult = {
  synced: number;
  /** Still pending after this run (including entries not attempted after a network failure). */
  pending: number;
  failed: number;
  /** Set when nothing was sent because there is no valid session for this cashier yet. */
  skipped?: 'no-session';
};

async function runSync(cashierId: string): Promise<SyncResult> {
  const entries = await listSyncable(cashierId);
  const result: SyncResult = { synced: 0, pending: entries.length, failed: 0 };
  if (entries.length === 0) return result;

  // Sync waits for a valid session of the same user (decision D5). getSession refreshes an
  // expired token; offline, the refresh fails and the entries simply stay pending.
  const { data } = await getSupabase().auth.getSession();
  if (data.session?.user.id !== cashierId) return { ...result, skipped: 'no-session' };

  for (const entry of entries) {
    await markSyncing(entry.id, new Date());
    const sent = await sendTransaction(entry);
    if (sent.ok) {
      await markSynced(entry.id);
      result.synced += 1;
      result.pending -= 1;
      continue;
    }
    if (classifySyncError(sent.error) === 'permanent') {
      await markNotSynced(entry.id, 'failed', errorText(sent.error));
      result.failed += 1;
      result.pending -= 1;
      continue;
    }
    // Transient: the rest would most likely fail the same way. Everything left stays pending.
    await markNotSynced(entry.id, 'pending', errorText(sent.error));
    break;
  }
  return result;
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Sends this cashier's pending sales to create_transaction once, oldest first (basic sync,
 * Phase 6; triggers, backoff, and cross-tab locking come in Phase 10). Only entries whose
 * cashier_id is the signed-in user are sent. Never deletes an entry. Calls in the same tab run
 * one after another, so the same entry is never sent twice at once.
 */
export function syncOnce(cashierId: string): Promise<SyncResult> {
  const run = queue.then(() => runSync(cashierId));
  // The caller still receives run's error; the queue only needs to know it finished.
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

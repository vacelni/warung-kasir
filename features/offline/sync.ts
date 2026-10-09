import { isAuthApiError } from '@supabase/supabase-js';
import { signOut } from '@/features/auth/api';
import { getSupabase } from '@/lib/supabase';
import { listSyncable, markNotSynced, markSynced, markSyncing, type OutboxEntry } from './outbox';

/** A hung request counts as a network failure and the sale stays pending (TECHNICAL_SPEC C.12). */
const RPC_TIMEOUT_MS = 15_000;

type RpcError = { code?: string; message: string };

export type SyncErrorKind = 'transient' | 'permanent' | 'session';

/**
 * Error mapping (TECHNICAL_SPEC C.12, SECURITY E.10). Decides whether resending can ever help.
 *
 * Permanent → `failed`, kept on the device, resent only when the user taps "Coba lagi":
 *  - WK001: create_transaction rejected the sale itself (arithmetic, code, product of another
 *    store, an id that belongs to another cashier or store);
 *  - WK002: the caller has no active profile (cashier deactivated before the sale synced);
 *  - SQLSTATE classes 22 (data exception, e.g. integer overflow) and 23 (integrity violation).
 *
 * Transient → stays `pending`, retried with backoff:
 *  - no response at all (offline, DNS, connection reset), a timeout (AbortError), a 5xx page;
 *  - PGRST301/PGRST303 and other JWT errors: the access token expired and auth-js will refresh
 *    it. If the server instead rejects the refresh token (banned or deleted user), auth-js ends
 *    the session and the app goes to login (D5), so this can never loop forever;
 *  - 42501 (no grant): the request went out without a session;
 *  - anything unexpected (e.g. PGRST202 while a migration is being deployed).
 *
 * Session → stays `pending`; the session is checked with the server at once:
 *  - WK003: the access token's session was ended on the server (password reset, deactivation,
 *    INFO-3) while the token itself has not expired yet. If the server refuses a refresh as well,
 *    the session is over: it is ended on this device and the app goes to login (D5); the sale
 *    syncs after the cashier signs in again.
 */
export function classifySyncError(error: RpcError): SyncErrorKind {
  if (error.code === 'WK003') return 'session';
  return /^(WK|22|23)/.test(error.code ?? '') ? 'permanent' : 'transient';
}

/**
 * After WK003: asks the server for a new session. Only an explicit refusal (400/401/403: refresh
 * token gone, session not found, user banned) means the session is over; auth-js keeps a session
 * whose access token has not expired yet, so it is ended here (SIGNED_OUT → login, outbox untouched).
 * A network failure, a rate limit (429), or a server error changes nothing: the sale stays pending
 * and sync retries.
 */
async function confirmSessionWithServer(): Promise<void> {
  const { error } = await getSupabase().auth.refreshSession();
  if (!error || !isAuthApiError(error) || ![400, 401, 403].includes(error.status)) return;
  console.warn('The server ended this session; signing in again is required:', error.message);
  await signOut();
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
  /**
   * Set when nothing was sent: `no-session` = no valid session for this cashier yet;
   * `offline` = the browser reports no network at all (decided by the sync manager).
   */
  skipped?: 'no-session' | 'offline';
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
    const kind = classifySyncError(sent.error);
    if (kind === 'permanent') {
      await markNotSynced(entry.id, 'failed', errorText(sent.error));
      result.failed += 1;
      result.pending -= 1;
      continue;
    }
    // Transient or session: the rest would most likely fail the same way. Everything left stays pending.
    await markNotSynced(entry.id, 'pending', errorText(sent.error));
    if (kind === 'session') await confirmSessionWithServer();
    break;
  }
  return result;
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Sends this cashier's pending sales to create_transaction once, oldest first. Only entries whose
 * cashier_id is the signed-in user are sent. Never deletes an entry. Calls in the same tab run
 * one after another, so the same entry is never sent twice at once.
 *
 * This is one pass. Triggers, backoff, and the cross-tab lock live in syncManager.ts, which is
 * what the app calls; nothing else should call this directly.
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

/**
 * Why the server rejected a sale, in words the cashier can act on (PRD §38, UI_SPEC A.21), from
 * the error kept in `last_error` ("WK002: …"). The technical text stays in the entry for the Owner.
 */
export function failureReason(lastError: string | null): string {
  const code = lastError?.split(':', 1)[0]?.trim() ?? '';
  if (code === 'WK002') return 'Akun kasir ini tidak aktif di server, sehingga transaksi tidak dapat disimpan.';
  if (code === 'WK001') return 'Server menolak data transaksi ini (data tidak valid untuk warung ini).';
  if (/^(22|23)/.test(code)) return 'Server menolak data transaksi ini karena nilainya tidak valid.';
  return 'Server menolak transaksi ini.';
}

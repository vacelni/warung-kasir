import { countUnsynced, pruneSynced, type UnsyncedCounts } from './outbox';
import { syncOnce, type SyncResult } from './sync';

/**
 * The one place that decides when this tab syncs (TECHNICAL_SPEC C.12). Every trigger — app
 * start, session refreshed, `online`, tab visible, checkout, "Coba lagi" — calls `request()`,
 * and they all converge here:
 *
 *  - in this tab, a request during a run does not start a second run; it marks the run to go
 *    once more when it ends (so a sale saved mid-run is still sent);
 *  - across tabs, the pass itself runs under the Web Lock `wk-sync`. A tab that finds the lock
 *    held skips (the holder is sending the same user's entries); checkout and manual requests
 *    wait for the lock instead, so their own sale is sent before they report back;
 *  - after a transient failure, one timer retries with exponential backoff capped at 5 minutes.
 *    There is no polling: with nothing pending, no timer exists. Any successful pass resets it.
 *
 * `navigator.onLine` is only a hint. When it says there is no network at all, a pass is skipped
 * (no request could succeed; it would only flicker "syncing") and counts as a transient failure, so
 * the backoff timer stays as a safety net and the `online` event runs the real attempt. When it
 * says online, that proves nothing: whether the server is reachable is learned by trying.
 * The server's UUID idempotency (create_transaction → 'exists') stays the final guarantee.
 */

export type SyncTrigger = 'start' | 'session' | 'online' | 'visible' | 'checkout' | 'manual' | 'retry';

export const BACKOFF_BASE_MS = 10_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

/** Delay before automatic retry number `failures` (1 = after the first failed pass): 10 s, 20 s, 40 s … 5 min. */
export function backoffDelay(failures: number): number {
  if (failures < 1) return 0;
  // Cap the exponent too, so a very long outage never computes Infinity.
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.min(failures - 1, 30));
}

export const SYNC_LOCK_NAME = 'wk-sync';

/** `ran: false` = another tab holds the lock and this request did not wait for it. */
export type LockOutcome<T> = { ran: true; value: T } | { ran: false };

/**
 * Runs `fn` while holding the cross-tab sync lock. Without the Web Locks API (very old browsers,
 * tests), it runs anyway: the in-tab queue in sync.ts and server idempotency still prevent
 * duplicates. The lock is released as soon as `fn` settles.
 */
export async function withSyncLock<T>(fn: () => Promise<T>, wait: boolean): Promise<LockOutcome<T>> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return { ran: true, value: await fn() };
  return locks.request(SYNC_LOCK_NAME, { ifAvailable: !wait }, async (lock): Promise<LockOutcome<T>> => {
    if (!lock) return { ran: false };
    return { ran: true, value: await fn() };
  });
}

export type SyncSnapshot = {
  cashierId: string | null;
  /** A pass of this tab is in progress. */
  running: boolean;
  /** This cashier's sales on the device that the server does not have yet. */
  pending: number;
  /** Rejected by the server; waiting for the user. */
  failed: number;
  /** Epoch ms of the scheduled automatic retry, or null. */
  nextRetryAt: number | null;
  /** The last pass could not finish (no connection, server error, or no valid session yet). */
  retrying: boolean;
  /** Increases on every outbox change seen by this tab (here or in another tab). */
  version: number;
};

export type SyncManagerDeps = {
  runOnce: (cashierId: string) => Promise<SyncResult>;
  countUnsynced: (cashierId: string) => Promise<UnsyncedCounts>;
  pruneSynced: (cashierId: string, now: Date) => Promise<number>;
  withLock: <T>(fn: () => Promise<T>, wait: boolean) => Promise<LockOutcome<T>>;
  /** True only when the browser knows there is no network at all (navigator.onLine === false). */
  isOffline: () => boolean;
  now: () => number;
  setTimer: (callback: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  /** Tells other tabs the outbox changed. */
  broadcast: () => void;
};

const WAITING_TRIGGERS: ReadonlySet<SyncTrigger> = new Set(['checkout', 'manual']);

const EMPTY: SyncSnapshot = {
  cashierId: null,
  running: false,
  pending: 0,
  failed: 0,
  nextRetryAt: null,
  retrying: false,
  version: 0,
};

export function createSyncManager(deps: SyncManagerDeps) {
  let snapshot: SyncSnapshot = EMPTY;
  const listeners = new Set<() => void>();
  let failures = 0;
  let timer: unknown = null;
  let cycle: Promise<SyncSnapshot> | null = null;
  let rerun: { wait: boolean } | null = null;

  function set(patch: Partial<SyncSnapshot>) {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  }

  const queuedRerun = () => rerun;

  function cancelTimer() {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
    if (snapshot.nextRetryAt !== null) set({ nextRetryAt: null });
  }

  async function refreshCounts(cashierId: string) {
    try {
      const counts = await deps.countUnsynced(cashierId);
      // The user may have changed while reading.
      if (snapshot.cashierId === cashierId) set({ ...counts, version: snapshot.version + 1 });
    } catch (error) {
      console.error('Could not count the unsynced sales on this device:', error);
    }
  }

  /** One pass, under the lock. Never throws: a failure becomes "retry later". */
  async function pass(cashierId: string, wait: boolean): Promise<LockOutcome<SyncResult> | null> {
    try {
      if (deps.isOffline()) {
        // Only a local read: is anything waiting for the network to come back?
        const { pending } = await deps.countUnsynced(cashierId);
        return { ran: true, value: { synced: 0, pending, failed: 0, skipped: 'offline' } };
      }
      return await deps.withLock(() => deps.runOnce(cashierId), wait);
    } catch (error) {
      console.error('Sync pass failed; the sales stay on this device:', error);
      return null;
    }
  }

  async function runCycle(cashierId: string, wait: boolean): Promise<SyncSnapshot> {
    cancelTimer();
    set({ running: true });
    let outcome: LockOutcome<SyncResult> | null;
    let next: { wait: boolean } | null = { wait };
    do {
      rerun = null;
      outcome = await pass(cashierId, next.wait);
      // A request that arrived during the pass (read through a call: TS cannot see the async write).
      next = queuedRerun();
    } while (next !== null && snapshot.cashierId === cashierId);

    if (snapshot.cashierId !== cashierId) return snapshot;

    // null = the pass threw (e.g. IndexedDB unavailable); pending > 0 = a transient failure or
    // no valid session yet. Both retry later. ran: false = another tab is syncing right now.
    const unfinished = outcome === null || (outcome.ran && outcome.value.pending > 0);
    if (unfinished) {
      failures += 1;
      const delay = backoffDelay(failures);
      timer = deps.setTimer(() => {
        timer = null;
        void request('retry');
      }, delay);
      set({ nextRetryAt: deps.now() + delay, retrying: true });
    } else if (outcome?.ran) {
      failures = 0;
      set({ retrying: false });
      try {
        await deps.pruneSynced(cashierId, new Date(deps.now()));
      } catch (error) {
        console.error('Could not prune old synced sales:', error);
      }
    }

    await refreshCounts(cashierId);
    set({ running: false });
    deps.broadcast();
    return snapshot;
  }

  /** Asks for a sync. Resolves with the state after the run this request joined. */
  function request(trigger: SyncTrigger): Promise<SyncSnapshot> {
    const cashierId = snapshot.cashierId;
    if (!cashierId) return Promise.resolve(snapshot);
    const wait = WAITING_TRIGGERS.has(trigger);
    if (cycle) {
      rerun = { wait: wait || (rerun?.wait ?? false) };
      return cycle;
    }
    const current = runCycle(cashierId, wait).finally(() => {
      if (cycle === current) cycle = null;
    });
    cycle = current;
    return current;
  }

  /** The signed-in user changed (login, logout). Only this user's entries are ever counted or sent. */
  function setCashier(cashierId: string | null) {
    if (snapshot.cashierId === cashierId) return;
    cancelTimer();
    failures = 0;
    rerun = null;
    cycle = null;
    set({ ...EMPTY, cashierId, version: snapshot.version + 1 });
    if (cashierId) void refreshCounts(cashierId);
  }

  return {
    request,
    setCashier,
    /** Another tab changed the outbox: re-read the counts so this tab's indicator stays true. */
    outboxChanged() {
      if (snapshot.cashierId) void refreshCounts(snapshot.cashierId);
    },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type SyncManager = ReturnType<typeof createSyncManager>;

const OUTBOX_CHANNEL = 'wk-outbox';

function openChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(OUTBOX_CHANNEL);
}

const channel = typeof window === 'undefined' ? null : openChannel();

/** This tab's sync manager. */
export const syncManager: SyncManager = createSyncManager({
  runOnce: syncOnce,
  countUnsynced,
  pruneSynced,
  withLock: withSyncLock,
  isOffline: () => typeof navigator !== 'undefined' && navigator.onLine === false,
  now: () => Date.now(),
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  broadcast: () => channel?.postMessage('changed'),
});

/** Calls back when another tab of this app changed the outbox. */
export function onOtherTabChange(callback: () => void): () => void {
  if (!channel) return () => {};
  const listener = () => callback();
  channel.addEventListener('message', listener);
  return () => channel.removeEventListener('message', listener);
}

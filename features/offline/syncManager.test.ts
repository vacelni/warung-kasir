import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncResult } from './sync';
import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  backoffDelay,
  createSyncManager,
  SYNC_LOCK_NAME,
  withSyncLock,
  type LockOutcome,
  type SyncManagerDeps,
} from './syncManager';

const OK: SyncResult = { synced: 1, pending: 0, failed: 0 };
const TRANSIENT: SyncResult = { synced: 0, pending: 1, failed: 0 };
const NO_SESSION: SyncResult = { synced: 0, pending: 1, failed: 0, skipped: 'no-session' };
const PERMANENT: SyncResult = { synced: 0, pending: 0, failed: 1 };

describe('backoffDelay', () => {
  it('waits 10 s before the first retry', () => {
    expect(backoffDelay(1)).toBe(BACKOFF_BASE_MS);
    expect(BACKOFF_BASE_MS).toBe(10_000);
  });

  it('doubles after each further failure', () => {
    expect([1, 2, 3, 4, 5].map(backoffDelay)).toEqual([10_000, 20_000, 40_000, 80_000, 160_000]);
  });

  it('never waits longer than 5 minutes, however long the outage', () => {
    expect(BACKOFF_MAX_MS).toBe(300_000);
    expect(backoffDelay(6)).toBe(300_000);
    expect(backoffDelay(50)).toBe(300_000);
    expect(backoffDelay(10_000)).toBe(300_000);
  });

  it('is zero before any failure', () => {
    expect(backoffDelay(0)).toBe(0);
  });
});

/** A manager with fake time, a fake lock, and a scripted sync pass. */
function setup() {
  let clock = 1_000_000;
  const timers: Array<{ at: number; callback: () => void; cleared: boolean }> = [];
  const results: Array<SyncResult | Error> = [];
  let lockHeldElsewhere = false;
  let offline = false;

  const deps: SyncManagerDeps = {
    runOnce: vi.fn(async () => {
      const next = results.shift() ?? OK;
      if (next instanceof Error) throw next;
      return next;
    }),
    countUnsynced: vi.fn(async () => ({ pending: 0, failed: 0 })),
    pruneSynced: vi.fn(async () => 0),
    withLock: vi.fn(async (fn: () => Promise<unknown>, wait: boolean): Promise<LockOutcome<unknown>> => {
      if (lockHeldElsewhere && !wait) return { ran: false };
      return { ran: true, value: await fn() };
    }) as SyncManagerDeps['withLock'],
    isOffline: () => offline,
    now: () => clock,
    setTimer: vi.fn((callback: () => void, ms: number) => {
      const timer = { at: clock + ms, callback, cleared: false };
      timers.push(timer);
      return timer;
    }),
    clearTimer: vi.fn((handle: unknown) => {
      (handle as { cleared: boolean }).cleared = true;
    }),
    broadcast: vi.fn(),
  };
  const manager = createSyncManager(deps);

  return {
    manager,
    deps,
    script: (...next: Array<SyncResult | Error>) => results.push(...next),
    holdLockElsewhere: (held: boolean) => {
      lockHeldElsewhere = held;
    },
    setOffline: (value: boolean) => {
      offline = value;
    },
    activeTimers: () => timers.filter((timer) => !timer.cleared),
    /** Moves the clock to the next scheduled retry and fires it. */
    async fireNextTimer() {
      const timer = timers.filter((t) => !t.cleared).sort((a, b) => a.at - b.at)[0];
      if (!timer) throw new Error('No timer scheduled.');
      clock = timer.at;
      timer.cleared = true;
      timer.callback();
      await vi.waitFor(() => expect(manager.getSnapshot().running).toBe(false));
    },
    delays: () => (deps.setTimer as ReturnType<typeof vi.fn>).mock.calls.map(([, ms]) => ms as number),
  };
}

describe('sync manager', () => {
  it('does nothing without a signed-in cashier', async () => {
    const { manager, deps } = setup();
    await manager.request('start');
    expect(deps.runOnce).not.toHaveBeenCalled();
  });

  it('runs one pass for the signed-in cashier only, under the cross-tab lock', async () => {
    const { manager, deps } = setup();
    manager.setCashier('cashier-1');

    await manager.request('start');

    expect(deps.runOnce).toHaveBeenCalledExactlyOnceWith('cashier-1');
    expect(deps.withLock).toHaveBeenCalledOnce();
    expect(deps.broadcast).toHaveBeenCalled();
  });

  it('coalesces triggers that arrive during a run into one more pass, not parallel runs (no thundering)', async () => {
    const { manager, deps } = setup();
    manager.setCashier('cashier-1');
    let release!: () => void;
    (deps.runOnce as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => new Promise<SyncResult>((resolve) => (release = () => resolve(OK))),
    );

    const first = manager.request('start');
    const triggers = [manager.request('online'), manager.request('visible'), manager.request('session'), manager.request('checkout')];
    await vi.waitFor(() => expect(release).toBeDefined());
    expect(deps.runOnce).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, ...triggers]);

    // The first pass, then exactly one re-run for everything that arrived meanwhile.
    expect(deps.runOnce).toHaveBeenCalledTimes(2);
    // Checkout asked to wait for the lock, so the re-run waits too.
    expect((deps.withLock as ReturnType<typeof vi.fn>).mock.calls.map(([, wait]) => wait)).toEqual([false, true]);
  });

  it('retries a transient failure with growing delays, capped at 5 minutes, and never polls when idle', async () => {
    const t = setup();
    t.manager.setCashier('cashier-1');
    t.script(TRANSIENT, TRANSIENT, TRANSIENT, TRANSIENT, TRANSIENT, TRANSIENT, TRANSIENT, OK);

    await t.manager.request('start');
    expect(t.manager.getSnapshot()).toMatchObject({ retrying: true, nextRetryAt: 1_000_000 + 10_000 });
    for (let i = 0; i < 7; i += 1) await t.fireNextTimer();

    expect(t.delays()).toEqual([10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000]);
    expect(t.deps.runOnce).toHaveBeenCalledTimes(8);
    // Success: no timer left, nothing scheduled while there is nothing to send.
    expect(t.activeTimers()).toHaveLength(0);
    expect(t.manager.getSnapshot()).toMatchObject({ retrying: false, nextRetryAt: null });
  });

  it('resets the backoff after a successful pass', async () => {
    const t = setup();
    t.manager.setCashier('cashier-1');
    t.script(TRANSIENT, TRANSIENT, OK, TRANSIENT);

    await t.manager.request('start');
    await t.fireNextTimer();
    await t.fireNextTimer(); // OK
    await t.manager.request('online'); // fails again

    expect(t.delays()).toEqual([10_000, 20_000, 10_000]);
  });

  it('an online/visible trigger runs at once and replaces the pending timer (one timer at most)', async () => {
    const t = setup();
    t.manager.setCashier('cashier-1');
    t.script(TRANSIENT, TRANSIENT);

    await t.manager.request('start');
    expect(t.activeTimers()).toHaveLength(1);
    await t.manager.request('online');

    expect(t.deps.runOnce).toHaveBeenCalledTimes(2);
    expect(t.activeTimers()).toHaveLength(1);
    expect(t.delays()).toEqual([10_000, 20_000]);
  });

  it('waits and retries while no valid session exists yet (offline token refresh, D5)', async () => {
    const t = setup();
    t.manager.setCashier('cashier-1');
    t.script(NO_SESSION);

    await t.manager.request('start');

    expect(t.manager.getSnapshot().retrying).toBe(true);
    expect(t.activeTimers()).toHaveLength(1);
  });

  it('does not schedule retries for a permanent rejection: failed entries wait for the user', async () => {
    const t = setup();
    t.manager.setCashier('cashier-1');
    t.script(PERMANENT);

    await t.manager.request('start');

    expect(t.activeTimers()).toHaveLength(0);
    expect(t.manager.getSnapshot().retrying).toBe(false);
  });

  it('treats an unexpected error in a pass as transient: logged, retried later, never thrown at the caller', async () => {
    const t = setup();
    t.manager.setCashier('cashier-1');
    t.script(new Error('IndexedDB unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(t.manager.request('checkout')).resolves.toMatchObject({ retrying: true });
    expect(t.activeTimers()).toHaveLength(1);
  });

  it('no network at all: sends nothing (no doomed request, no "syncing" flicker), retries later', async () => {
    const t = setup();
    (t.deps.countUnsynced as ReturnType<typeof vi.fn>).mockResolvedValue({ pending: 2, failed: 0 });
    t.manager.setCashier('cashier-1');
    t.setOffline(true);

    await t.manager.request('start');

    expect(t.deps.runOnce).not.toHaveBeenCalled();
    expect(t.deps.withLock).not.toHaveBeenCalled();
    expect(t.manager.getSnapshot()).toMatchObject({ retrying: true, pending: 2 });
    expect(t.activeTimers()).toHaveLength(1);

    // The online event runs the real pass at once.
    t.setOffline(false);
    await t.manager.request('online');
    expect(t.deps.runOnce).toHaveBeenCalledOnce();
  });

  it('no network and nothing waiting: no timer at all', async () => {
    const t = setup();
    t.manager.setCashier('cashier-1');
    t.setOffline(true);

    await t.manager.request('visible');

    expect(t.activeTimers()).toHaveLength(0);
  });

  it('skips when another tab holds the lock, without scheduling a retry of its own', async () => {
    const t = setup();
    t.manager.setCashier('cashier-1');
    t.holdLockElsewhere(true);

    await t.manager.request('visible');

    expect(t.deps.runOnce).not.toHaveBeenCalled();
    expect(t.activeTimers()).toHaveLength(0);
  });

  it('checkout and manual requests wait for the lock instead of skipping', async () => {
    const t = setup();
    t.manager.setCashier('cashier-1');
    t.holdLockElsewhere(true);

    await t.manager.request('checkout');
    await t.manager.request('manual');

    expect(t.deps.runOnce).toHaveBeenCalledTimes(2);
  });

  it('prunes old synced copies only after a successful pass', async () => {
    const t = setup();
    t.manager.setCashier('cashier-1');
    t.script(TRANSIENT, OK);

    await t.manager.request('start');
    expect(t.deps.pruneSynced).not.toHaveBeenCalled();
    await t.manager.request('manual');
    expect(t.deps.pruneSynced).toHaveBeenCalledExactlyOnceWith('cashier-1', expect.any(Date));
  });

  it('publishes the unsynced counts of the current cashier', async () => {
    const t = setup();
    (t.deps.countUnsynced as ReturnType<typeof vi.fn>).mockResolvedValue({ pending: 2, failed: 1 });
    t.manager.setCashier('cashier-1');

    await t.manager.request('start');

    expect(t.deps.countUnsynced).toHaveBeenCalledWith('cashier-1');
    expect(t.manager.getSnapshot()).toMatchObject({ cashierId: 'cashier-1', pending: 2, failed: 1, running: false });
  });

  it('logout: cancels the retry timer, forgets the counts, and never syncs for the old user again', async () => {
    const t = setup();
    t.manager.setCashier('cashier-1');
    t.script(TRANSIENT);
    await t.manager.request('start');
    expect(t.activeTimers()).toHaveLength(1);

    t.manager.setCashier(null);

    expect(t.activeTimers()).toHaveLength(0);
    expect(t.manager.getSnapshot()).toMatchObject({ cashierId: null, pending: 0, failed: 0, nextRetryAt: null });
    await t.manager.request('online');
    expect(t.deps.runOnce).toHaveBeenCalledTimes(1);
  });

  it('a different user signing in syncs only as that user (never the previous user’s queue)', async () => {
    const t = setup();
    t.manager.setCashier('cashier-a');
    await t.manager.request('start');
    t.manager.setCashier(null);
    t.manager.setCashier('cashier-b');

    await t.manager.request('start');

    expect((t.deps.runOnce as ReturnType<typeof vi.fn>).mock.calls).toEqual([['cashier-a'], ['cashier-b']]);
  });

  it('notifies subscribers on every change', async () => {
    const t = setup();
    const listener = vi.fn();
    t.manager.subscribe(listener);
    t.manager.setCashier('cashier-1');

    await t.manager.request('start');

    expect(listener).toHaveBeenCalled();
    expect(t.manager.getSnapshot().version).toBeGreaterThan(0);
  });
});

describe('withSyncLock (Web Locks, TECHNICAL_SPEC C.12)', () => {
  type Request = (name: string, options: { ifAvailable?: boolean }, callback: (lock: object | null) => Promise<unknown>) => Promise<unknown>;

  /** A one-holder lock manager, like navigator.locks for a single lock name. */
  function fakeLocks() {
    let held = false;
    const waiters: Array<() => void> = [];
    const request: Request = async (name, options, callback) => {
      expect(name).toBe(SYNC_LOCK_NAME);
      if (held && options.ifAvailable) return callback(null);
      if (held) await new Promise<void>((resolve) => waiters.push(resolve));
      held = true;
      try {
        return await callback({ name });
      } finally {
        held = false;
        waiters.shift()?.();
      }
    };
    return { request: vi.fn(request) };
  }

  let original: PropertyDescriptor | undefined;
  beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  });
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
  });

  function withNavigatorLocks(locks: object | undefined) {
    Object.defineProperty(globalThis, 'navigator', { value: { locks }, configurable: true });
  }

  it('runs the pass while holding the lock, then releases it', async () => {
    const locks = fakeLocks();
    withNavigatorLocks(locks);

    await expect(withSyncLock(async () => 'done', false)).resolves.toEqual({ ran: true, value: 'done' });
    // Released: a second request gets it immediately.
    await expect(withSyncLock(async () => 'again', false)).resolves.toEqual({ ran: true, value: 'again' });
  });

  it('a second tab skips while the first holds the lock (two tabs never sync at once)', async () => {
    const locks = fakeLocks();
    withNavigatorLocks(locks);
    let finish!: () => void;
    const running: string[] = [];

    const tabA = withSyncLock(
      () =>
        new Promise<string>((resolve) => {
          running.push('A');
          finish = () => resolve('A');
        }),
      false,
    );
    await vi.waitFor(() => expect(running).toEqual(['A']));
    const tabB = await withSyncLock(async () => {
      running.push('B');
      return 'B';
    }, false);

    expect(tabB).toEqual({ ran: false });
    finish();
    await expect(tabA).resolves.toEqual({ ran: true, value: 'A' });
    expect(running).toEqual(['A']);
  });

  it('a waiting request runs after the holder finishes (no deadlock, no overlap)', async () => {
    const locks = fakeLocks();
    withNavigatorLocks(locks);
    const order: string[] = [];
    let finish!: () => void;

    const first = withSyncLock(
      () =>
        new Promise<void>((resolve) => {
          order.push('first:start');
          finish = () => {
            order.push('first:end');
            resolve();
          };
        }),
      false,
    );
    await vi.waitFor(() => expect(order).toEqual(['first:start']));
    const second = withSyncLock(async () => {
      order.push('second');
    }, true);
    finish();
    await Promise.all([first, second]);

    expect(order).toEqual(['first:start', 'first:end', 'second']);
  });

  it('releases the lock when the pass throws', async () => {
    const locks = fakeLocks();
    withNavigatorLocks(locks);

    await expect(withSyncLock(() => Promise.reject(new Error('boom')), false)).rejects.toThrow('boom');
    await expect(withSyncLock(async () => 'next', false)).resolves.toEqual({ ran: true, value: 'next' });
  });

  it('still runs without the Web Locks API (server idempotency remains the guarantee)', async () => {
    withNavigatorLocks(undefined);

    await expect(withSyncLock(async () => 'ran', false)).resolves.toEqual({ ran: true, value: 'ran' });
  });
});

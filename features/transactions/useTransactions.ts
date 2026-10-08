'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProfile } from '@/features/auth/AuthProvider';
import { listEntries } from '@/features/offline/outbox';
import { listTransactions, type Cursor } from './api';
import {
  dateRangeFor,
  isInRange,
  matchesCode,
  type DatePreset,
  type DateRange,
  type HistoryOrder,
} from './filters';
import { fromOutbox, mergeHistory, type HistoryEntry } from './model';

export type HistoryFilters = {
  preset: DatePreset;
  order: HistoryOrder;
  /** Already normalized (see `normalizeSearch`). */
  search: string;
};

type ServerPages =
  | { ok: false }
  | { ok: true; entries: HistoryEntry[]; next: Cursor | null; loadingMore: boolean; loadMoreFailed: boolean };

/** The answer to one query, tagged with the query it belongs to. */
type Loaded = {
  key: string;
  /** Fixed when the query starts, so every page of it covers the same days. */
  range: DateRange;
  local: HistoryEntry[];
  server: ServerPages;
};

/** This device's own sales. A read failure must not hide the server history, so it degrades to none. */
async function readLocal(cashierId: string, storeId: string, cashierName: string): Promise<HistoryEntry[]> {
  try {
    // Same rule as the detail page: the signed-in user's own sales of their own store.
    return (await listEntries(cashierId))
      .filter((entry) => entry.store_id === storeId)
      .map((entry) => fromOutbox(entry, cashierName));
  } catch (error) {
    console.error('Could not read the sales saved on this device:', error);
    return [];
  }
}

/**
 * History data for the list screen: the server's pages merged with this device's own sales
 * (pending, failed, and the local copy of synced ones), filtered and sorted the same way.
 */
export function useTransactions({ preset, order, search }: HistoryFilters) {
  const { id: userId, storeId, name: userName, role } = useProfile();
  // Cashiers also ask the server for their own sales only; RLS enforces it either way (D1).
  const cashierId = role === 'cashier' ? userId : null;

  const [reloadCount, setReloadCount] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = [preset, order, search, userId, reloadCount].join('|');
  const keyRef = useRef(key);

  // Anything loaded for another query counts as "still loading": derived, so a filter change
  // never shows the previous filter's rows.
  const current = loaded?.key === key ? loaded : null;

  useEffect(() => {
    keyRef.current = key;
    let active = true;
    const range = dateRangeFor(preset, new Date());

    void Promise.all([
      readLocal(userId, storeId, userName),
      listTransactions({ search, range, order, cashierId, after: null }).then(
        (page): ServerPages => ({ ok: true, ...page, loadingMore: false, loadMoreFailed: false }),
        (error: unknown): ServerPages => {
          console.error('Could not load the transaction history:', error);
          return { ok: false };
        },
      ),
    ]).then(([local, server]) => {
      if (active) setLoaded({ key, range, local, server });
    });

    return () => {
      active = false;
    };
  }, [key, preset, order, search, userId, storeId, userName, cashierId]);

  // Sync status can change while the screen is open (another tab, a finished sync). Re-read the
  // outbox when the user comes back, so badges stay true without polling.
  useEffect(() => {
    function refreshLocal() {
      if (document.visibilityState !== 'visible') return;
      const forKey = keyRef.current;
      void readLocal(userId, storeId, userName).then((local) => {
        setLoaded((prev) => (prev?.key === forKey ? { ...prev, local } : prev));
      });
    }
    document.addEventListener('visibilitychange', refreshLocal);
    return () => document.removeEventListener('visibilitychange', refreshLocal);
  }, [userId, storeId, userName]);

  function loadMore() {
    if (!current || !current.server.ok || !current.server.next || current.server.loadingMore) return;
    const forKey = current.key;
    const { range } = current;
    const after = current.server.next;

    const update = (change: (server: Extract<ServerPages, { ok: true }>) => ServerPages) =>
      setLoaded((prev) => (prev?.key === forKey && prev.server.ok ? { ...prev, server: change(prev.server) } : prev));

    update((server) => ({ ...server, loadingMore: true, loadMoreFailed: false }));
    listTransactions({ search, range, order, cashierId, after }).then(
      (page) =>
        update((server) => {
          // The cursor never repeats a row; the id check also guards against a double tap.
          const known = new Set(server.entries.map((entry) => entry.id));
          const added = page.entries.filter((entry) => !known.has(entry.id));
          return { ...server, entries: [...server.entries, ...added], next: page.next, loadingMore: false };
        }),
      (error: unknown) => {
        console.error('Could not load more transactions:', error);
        update((server) => ({ ...server, loadingMore: false, loadMoreFailed: true }));
      },
    );
  }

  /** After a failed first load: fetch again. */
  const retry = useCallback(() => setReloadCount((count) => count + 1), []);

  const items = useMemo(() => {
    if (!current) return [];
    const server = current.server.ok ? current.server : null;
    const matching = current.local.filter(
      (entry) => isInRange(entry.createdAt, current.range) && matchesCode(entry.code, search),
    );
    return mergeHistory({
      server: server?.entries ?? [],
      local: matching,
      order,
      hasMore: server?.next != null,
    });
  }, [current, search, order]);

  const server = current?.server.ok ? current.server : null;
  return {
    status: current ? (current.server.ok ? ('ready' as const) : ('error' as const)) : ('loading' as const),
    items,
    hasMore: server?.next != null,
    loadingMore: server?.loadingMore ?? false,
    loadMoreFailed: server?.loadMoreFailed ?? false,
    loadMore,
    retry,
  };
}

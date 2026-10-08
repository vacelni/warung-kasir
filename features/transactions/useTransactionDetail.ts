'use client';

import { useCallback, useEffect, useState } from 'react';
import { useProfile } from '@/features/auth/AuthProvider';
import type { Profile } from '@/features/auth/account';
import { getOutboxEntry } from '@/features/offline/outbox';
import { getTransaction } from './api';
import { detailFromOutbox, type TransactionDetail } from './model';

export type DetailState =
  | { status: 'loading' }
  | { status: 'notFound' }
  | { status: 'error' }
  | { status: 'ready'; detail: TransactionDetail };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The sale on this device, only if it is the signed-in user's own (a device can be shared). */
async function readLocal(id: string, profile: Profile): Promise<TransactionDetail | null> {
  try {
    const entry = await getOutboxEntry(id);
    return entry && entry.cashier_id === profile.id && entry.store_id === profile.storeId
      ? detailFromOutbox(entry, profile.name)
      : null;
  } catch (error) {
    console.error('Could not read the sale saved on this device:', error);
    return null;
  }
}

/**
 * Finds one sale for the detail page. The server row wins when it exists; otherwise the copy in
 * this device's outbox is shown, so a sale that has not synced yet (or cannot be reached while
 * offline) still opens. Only when neither source has it is it "not found".
 */
export async function loadTransactionDetail(id: string | null, profile: Profile): Promise<DetailState> {
  if (!id || !UUID.test(id)) return { status: 'notFound' };

  const [local, server] = await Promise.all([
    readLocal(id, profile),
    getTransaction(id).then(
      (detail) => ({ ok: true as const, detail }),
      (error: unknown) => {
        console.error('Could not load the transaction:', error);
        return { ok: false as const };
      },
    ),
  ]);

  if (server.ok && server.detail) return { status: 'ready', detail: server.detail };
  if (local) return { status: 'ready', detail: local };
  return server.ok ? { status: 'notFound' } : { status: 'error' };
}

type Loaded = { key: string; state: DetailState };

export function useTransactionDetail(id: string | null) {
  const profile = useProfile();
  const [reloadCount, setReloadCount] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = [id, profile.id, reloadCount].join('|');

  useEffect(() => {
    let active = true;
    void loadTransactionDetail(id, profile).then((state) => {
      if (active) setLoaded({ key, state });
    });
    return () => {
      active = false;
    };
  }, [key, id, profile]);

  const retry = useCallback(() => setReloadCount((count) => count + 1), []);
  const state: DetailState = loaded?.key === key ? loaded.state : { status: 'loading' };
  return { state, retry };
}

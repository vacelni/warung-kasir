'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { Tone } from '@/components/ui/tones';
import { retryFailed } from './outbox';
import { syncManager, type SyncSnapshot } from './syncManager';
import { useConnectivity } from './useConnectivity';
import { useSyncStatus } from './useSyncStatus';

export type SyncSummary = {
  tone: Tone;
  /** Short label for the badge. */
  label: string;
  /** What it means and what happens next (UI_SPEC A.21); null when everything is synced. */
  detail: string | null;
  /** Something the user can retry now. */
  canRetry: boolean;
};

/**
 * The words for this device's sync state (UI_SPEC A.24, PRD §38). Always text, never color
 * alone (PRD §42). Failed comes first: it needs the user; pending resolves by itself.
 */
export function describeSync(state: Pick<SyncSnapshot, 'pending' | 'failed' | 'running'>, online: boolean): SyncSummary {
  const { pending, failed, running } = state;
  if (failed > 0) {
    return {
      tone: 'danger',
      label: `${failed} gagal sinkron`,
      detail:
        `Server menolak ${failed} transaksi. Transaksi tetap tersimpan di perangkat ini dan tidak dihapus. ` +
        'Hubungi Owner, lalu tekan Coba Lagi.' +
        (pending > 0 ? ` ${pending} transaksi lain menunggu sinkronisasi.` : ''),
      canRetry: true,
    };
  }
  if (pending > 0) {
    if (running) return { tone: 'warning', label: 'Menyinkronkan…', detail: `${pending} transaksi sedang dikirim ke server.`, canRetry: false };
    return {
      tone: 'warning',
      label: `${pending} belum tersinkron`,
      detail: online
        ? 'Transaksi tersimpan di perangkat. Sinkronisasi akan dicoba kembali.'
        : 'Koneksi internet tidak tersedia. Transaksi tersimpan di perangkat dan disinkronkan saat koneksi kembali.',
      canRetry: online,
    };
  }
  return { tone: 'success', label: 'Semua tersinkron', detail: null, canRetry: false };
}

/** "Coba lagi": failed sales go back to pending, then one sync runs now (same UUIDs, same sales). */
async function retryNow(cashierId: string): Promise<void> {
  await retryFailed(cashierId);
  await syncManager.request('manual');
}

/** The sync section of Lainnya (UI_SPEC A.7, A.24): counts, explanation, and Coba Lagi. */
export function SyncStatusPanel() {
  const state = useSyncStatus();
  const { online } = useConnectivity();
  const [retrying, setRetrying] = useState(false);
  const summary = describeSync(state, online);

  function retry() {
    if (!state.cashierId || retrying) return;
    setRetrying(true);
    retryNow(state.cashierId)
      .catch((error: unknown) => console.error('Retry failed; the sales stay on this device:', error))
      .finally(() => setRetrying(false));
  }

  return (
    <section aria-label="Status sinkronisasi" className="flex flex-col gap-3 px-4 py-3">
      <div className="flex min-h-8 items-center gap-3">
        <Icon name="sync" className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1 text-base font-medium text-foreground">Status sinkronisasi</span>
        <span role="status">
          <Badge tone={summary.tone}>{summary.label}</Badge>
        </span>
      </div>
      {!online && <p className="text-body text-muted">Perangkat sedang offline.</p>}
      {summary.detail && <p className="text-body text-muted">{summary.detail}</p>}
      {summary.canRetry && (
        <Button variant="secondary" className="w-full" onClick={retry} disabled={retrying || state.running}>
          {retrying || state.running ? 'MENYINKRONKAN…' : 'COBA LAGI'}
        </Button>
      )}
    </section>
  );
}

/**
 * Compact header indicator (UI_SPEC A.24, PRD §44): shown only when something is not synced or
 * the device is offline, so a normal day shows nothing.
 */
export function SyncIndicator() {
  const state = useSyncStatus();
  const { online } = useConnectivity();
  if (state.failed === 0 && state.pending === 0 && online) return null;
  const summary = describeSync(state, online);
  return (
    <span role="status" className="flex shrink-0 flex-wrap justify-end gap-1">
      {!online && <Badge tone="neutral">Offline</Badge>}
      {summary.tone !== 'success' && <Badge tone={summary.tone}>{summary.label}</Badge>}
    </span>
  );
}

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { countUnsynced } from '@/features/offline/outbox';
import { syncManager } from '@/features/offline/syncManager';
import { useConnectivity } from '@/features/offline/useConnectivity';
import { useAuth, useProfile } from './AuthProvider';

type Phase = 'idle' | 'checking' | 'warning' | 'syncing' | 'leaving';

/** Pending + failed sales of this user on the device; null when the outbox cannot be read. */
async function unsyncedCount(cashierId: string): Promise<number | null> {
  try {
    const { pending, failed } = await countUnsynced(cashierId);
    return pending + failed;
  } catch (error) {
    console.error('Could not count the unsynced sales on this device:', error);
    return null;
  }
}

/**
 * Signs this device out. With sales not yet on the server, a blocking warning comes first
 * (UI_SPEC A.24, decision D5): sync now, cancel, or leave anyway. Leaving never deletes a sale;
 * the outbox keeps it for this same user, who syncs it after logging in again on this device.
 */
export function LogoutButton({ className }: { className?: string }) {
  const { logout } = useAuth();
  const profile = useProfile();
  const { online } = useConnectivity();
  const [phase, setPhase] = useState<Phase>('idle');
  const [unsynced, setUnsynced] = useState<number | null>(0);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  async function leave() {
    setPhase('leaving');
    try {
      await logout();
    } catch (error) {
      console.error('Could not sign out:', error);
      setPhase('idle');
    }
  }

  async function handleClick() {
    setPhase('checking');
    setSyncNote(null);
    const count = await unsyncedCount(profile.id);
    if (count === 0) {
      await leave();
      return;
    }
    setUnsynced(count);
    setPhase('warning');
  }

  async function syncNow() {
    setPhase('syncing');
    await syncManager.request('manual');
    const count = await unsyncedCount(profile.id);
    if (count === 0) {
      await leave();
      return;
    }
    setUnsynced(count);
    setSyncNote('Sinkronisasi belum berhasil. Transaksi tetap tersimpan di perangkat ini.');
    setPhase('warning');
  }

  const dialogOpen = phase === 'warning' || phase === 'syncing';
  const busy = phase !== 'idle' && phase !== 'warning';
  const title =
    unsynced === null
      ? 'Status transaksi di perangkat ini tidak dapat diperiksa.'
      : `Masih ada ${unsynced} transaksi belum tersinkron.`;

  return (
    <>
      <Button variant="danger-outline" onClick={() => void handleClick()} disabled={busy} className={className}>
        <Icon name="logout" size={20} />
        Keluar
      </Button>

      <Dialog
        open={dialogOpen}
        onClose={() => setPhase('idle')}
        dismissible={false}
        title={title}
        description="Transaksi tetap tersimpan di perangkat ini dan akan disinkronkan saat akun yang sama masuk kembali di perangkat ini."
      >
        {syncNote && (
          <p role="status" className="text-body text-warning-ink">
            {syncNote}
          </p>
        )}
        {!online && <p className="text-body text-muted">Perangkat sedang offline, sinkronisasi belum dapat dilakukan.</p>}
        <div className="flex flex-col gap-3">
          {online && (
            <Button onClick={() => void syncNow()} disabled={phase === 'syncing'}>
              {phase === 'syncing' ? 'MENYINKRONKAN…' : 'SINKRONKAN SEKARANG'}
            </Button>
          )}
          <Button variant="secondary" data-autofocus onClick={() => setPhase('idle')} disabled={phase === 'syncing'}>
            BATAL
          </Button>
        </div>
        {/* The way out that leaves sales unsynced sits apart from the safe choices (UI_SPEC A.6). */}
        <div className="mt-2 border-t border-border pt-4">
          <Button variant="danger-outline" className="w-full" onClick={() => void leave()} disabled={phase === 'syncing'}>
            Tetap keluar
          </Button>
        </div>
      </Dialog>
    </>
  );
}

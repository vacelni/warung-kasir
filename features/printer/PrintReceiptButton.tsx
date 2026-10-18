'use client';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useProfile } from '@/features/auth/AuthProvider';
import { loadReceiptStore } from '@/features/transactions/receiptStore';
import { printReceipt } from './print';
import type { ReceiptData } from './escpos';
import { usePrintStatus } from './usePrintStatus';

/**
 * Prints the receipt of one sale on the paired Bluetooth printer (UI_SPEC A.14, A.15). Printing is
 * always a tap: a missing printer or paper never blocks the sale, which is already saved.
 */
export function PrintReceiptButton({ detail, className }: { detail: ReceiptData; className?: string }) {
  const profile = useProfile();
  const { status, run } = usePrintStatus();
  const busy = status.state === 'busy';

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        className={className}
        disabled={busy}
        onClick={() => void run(() => printReceipt(detail, () => loadReceiptStore(profile.id, profile.storeId)))}
      >
        <Icon name="print" size={20} />
        {busy ? 'MENCETAK…' : 'CETAK STRUK'}
      </Button>
      {status.state === 'done' && (
        <p role="status" className="text-center text-body text-muted">
          Struk dikirim ke printer.
        </p>
      )}
      {status.state === 'error' && <Alert tone="danger">{status.message}</Alert>}
    </div>
  );
}

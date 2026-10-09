/**
 * Sale-time plausibility (SEC-06, DATABASE D.10, UI_SPEC A.15). `created_at` comes from the device
 * clock; `synced_at` from the server. A synced sale is flagged for the owner to check, never
 * rejected or rewritten:
 *  - `future`: sold more than 5 minutes after the server received it (the device clock was ahead);
 *  - `late`: received more than 24 hours after the sale (long offline, or a clock set back).
 * Pure; used by the history (owner view) and the transactions CSV export.
 */

export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
export const LATE_SYNC_MS = 24 * 60 * 60 * 1000;

export type SaleTimeFlag = 'future' | 'late';

/** Null for an unsynced sale (no server time yet) or a plausible one. */
export function saleTimeFlag(createdAt: string, syncedAt: string | null): SaleTimeFlag | null {
  if (syncedAt === null) return null;
  const sold = Date.parse(createdAt);
  const received = Date.parse(syncedAt);
  if (Number.isNaN(sold) || Number.isNaN(received)) return null;
  if (sold - received > FUTURE_TOLERANCE_MS) return 'future';
  if (received - sold > LATE_SYNC_MS) return 'late';
  return null;
}

/** Why the owner should check the sale time, in the app's language. */
export const SALE_TIME_FLAG_REASONS: Record<SaleTimeFlag, string> = {
  future: 'Waktu penjualan lebih dari 5 menit setelah diterima server. Jam perangkat mungkin tidak tepat.',
  late: 'Diterima server lebih dari 24 jam setelah waktu penjualan.',
};

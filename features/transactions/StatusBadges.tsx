import { Badge } from '@/components/ui/Badge';
import type { Tone } from '@/components/ui/tones';
import type { HistoryEntry } from './model';

type Label = { text: string; tone: Tone };

/**
 * Device sync state (decision D3), in the wording of UI_SPEC A.15. A sale that came from the server
 * has no sync state of its own: the server has it, so it counts as "Tersinkron".
 */
export function syncLabel(entry: HistoryEntry): Label {
  switch (entry.syncStatus) {
    case 'failed':
      return { text: 'Gagal sinkron', tone: 'danger' };
    case 'pending':
    case 'syncing':
      return { text: 'Belum tersinkron', tone: 'warning' };
    case 'synced':
    case null:
      return { text: 'Tersinkron', tone: 'success' };
  }
}

/** Business status on the server. Null for a sale the server has not seen yet. */
export function statusLabel(entry: HistoryEntry): Label | null {
  switch (entry.serverStatus) {
    case 'completed':
      return { text: 'Selesai', tone: 'neutral' };
    case 'cancelled':
      return { text: 'Dibatalkan', tone: 'danger' };
    case null:
      return null;
  }
}

/**
 * The card shows only what needs attention: a sale not yet on the server, or a cancelled one.
 * The detail page shows both statuses, always, as text (never color alone, PRD §42).
 */
export function StatusBadges({ entry, all = false }: { entry: HistoryEntry; all?: boolean }) {
  const sync = syncLabel(entry);
  const status = statusLabel(entry);
  const showSync = all || sync.tone !== 'success';
  const showStatus = status !== null && (all || status.tone === 'danger');

  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      {showStatus && <Badge tone={status.tone}>{status.text}</Badge>}
      {showSync && <Badge tone={sync.tone}>{sync.text}</Badge>}
    </span>
  );
}

import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/lib/cx';
import { ROLE_LABELS } from '@/lib/permissions';
import type { Cashier } from './api';

type CashierRowProps = {
  cashier: Cashier;
  onOpenActions: (cashier: Cashier) => void;
};

/** One cashier: name, role, status. The ⋮ button opens the action sheet (UI_SPEC A.18). */
export function CashierRow({ cashier, onOpenActions }: CashierRowProps) {
  return (
    <li className="flex min-h-20 items-center gap-2 py-2 pr-2 pl-4">
      <div className={cx('min-w-0 flex-1', !cashier.isActive && 'text-muted')}>
        <p className="text-base font-semibold break-words">{cashier.name}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption">
          <span className="text-muted">{ROLE_LABELS.cashier}</span>
          <Badge tone={cashier.isActive ? 'success' : 'neutral'}>{cashier.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
        </p>
      </div>
      <button
        type="button"
        onClick={() => onOpenActions(cashier)}
        aria-label={`Aksi untuk ${cashier.name}`}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control text-muted active:bg-subtle hover:bg-subtle"
      >
        <Icon name="moreVertical" />
      </button>
    </li>
  );
}

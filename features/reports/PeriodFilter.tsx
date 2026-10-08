import { Input } from '@/components/ui/Input';
import { cx } from '@/lib/cx';
import { REPORT_PERIODS, REPORT_PERIOD_LABELS, type ReportPeriod } from './range';

type PeriodFilterProps = {
  period: ReportPeriod;
  onPeriodChange: (period: ReportPeriod) => void;
  fromDay: string;
  toDay: string;
  onFromDayChange: (day: string) => void;
  onToDayChange: (day: string) => void;
  /** Message for an unusable custom range. */
  customError: string | null;
};

/** The time filter (PRD §21): Hari Ini | 7 Hari | 30 Hari | Custom. Custom reveals two date fields. */
export function PeriodFilter({
  period,
  onPeriodChange,
  fromDay,
  toDay,
  onFromDayChange,
  onToDayChange,
  customError,
}: PeriodFilterProps) {
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Periode laporan" className="grid grid-cols-4 gap-2">
        {REPORT_PERIODS.map((value) => {
          const selected = value === period;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              onClick={() => onPeriodChange(value)}
              className={cx(
                'min-h-12 min-w-0 rounded-control border px-1 text-body font-semibold select-none',
                selected
                  ? 'border-primary bg-primary text-white'
                  : 'border-border-strong bg-surface text-foreground active:bg-subtle hover:bg-subtle',
              )}
            >
              {REPORT_PERIOD_LABELS[value]}
            </button>
          );
        })}
      </div>

      {period === 'custom' && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="date"
              label="Dari tanggal"
              value={fromDay}
              onChange={(event) => onFromDayChange(event.target.value)}
            />
            <Input
              type="date"
              label="Sampai tanggal"
              value={toDay}
              onChange={(event) => onToDayChange(event.target.value)}
            />
          </div>
          {customError && (
            <p role="alert" className="text-caption font-medium text-danger-ink">
              {customError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

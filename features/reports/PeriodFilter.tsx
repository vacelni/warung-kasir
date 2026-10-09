import { DateRangeFields } from '@/components/ui/DateRangeFields';
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
        <DateRangeFields
          fromDay={fromDay}
          toDay={toDay}
          onFromDayChange={onFromDayChange}
          onToDayChange={onToDayChange}
          error={customError}
        />
      )}
    </div>
  );
}

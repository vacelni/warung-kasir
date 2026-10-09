import { countJakartaDays, dayRangeInstants, jakartaDayStart, validateDayRange } from '@/lib/time';

export { jakartaDayInput } from '@/lib/time';

/** Time filter choices (PRD §21, UI_SPEC A.16). Days are Asia/Jakarta days, never device days. */
export const REPORT_PERIODS = ['today', 'last7', 'last30', 'custom'] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  today: 'Hari Ini',
  last7: '7 Hari',
  last30: '30 Hari',
  custom: 'Custom',
};

export function isReportPeriod(value: string): value is ReportPeriod {
  return (REPORT_PERIODS as readonly string[]).includes(value);
}

/** The longest window the report functions accept (days). Keeps every report query bounded. */
export const MAX_REPORT_DAYS = 366;

/** How the chart groups sales: by hour for a single day, by day otherwise. */
export type ReportBucket = 'hour' | 'day';

/**
 * A report window: `from` inclusive and `to` exclusive (ISO 8601 instants), always whole Asia/Jakarta
 * days, so the database counts exactly the days the owner picked.
 */
export type ReportRange = { from: string; to: string; bucket: ReportBucket; days: number };

/** What the owner chose. Custom days are "YYYY-MM-DD" (the value of a date input), both inclusive. */
export type ReportSelection =
  | { period: 'today' | 'last7' | 'last30' }
  | { period: 'custom'; fromDay: string; toDay: string };

function toRange(from: Date, to: Date): ReportRange {
  const days = countJakartaDays(from, to);
  return { from: from.toISOString(), to: to.toISOString(), bucket: days === 1 ? 'hour' : 'day', days };
}

/** A message for an unusable custom range, or null when it is fine. */
export function validateCustomRange(fromDay: string, toDay: string): string | null {
  return validateDayRange(fromDay, toDay, MAX_REPORT_DAYS);
}

/**
 * The window a selection covers at `now`. "7 Hari" and "30 Hari" include today (the same rule as the
 * history filter). Throws a RangeError for an unusable custom range; check `validateCustomRange` first.
 */
export function reportRangeFor(selection: ReportSelection, now: Date): ReportRange {
  switch (selection.period) {
    case 'today':
      return toRange(jakartaDayStart(now), jakartaDayStart(now, 1));
    case 'last7':
      return toRange(jakartaDayStart(now, -6), jakartaDayStart(now, 1));
    case 'last30':
      return toRange(jakartaDayStart(now, -29), jakartaDayStart(now, 1));
    case 'custom': {
      const { from, to } = dayRangeInstants(selection.fromDay, selection.toDay, MAX_REPORT_DAYS);
      return toRange(from, to);
    }
  }
}


/** "dalam 7 hari terakhir"-style phrase for empty states. */
export function periodPhrase(selection: ReportSelection): string {
  switch (selection.period) {
    case 'today':
      return 'hari ini';
    case 'last7':
      return 'dalam 7 hari terakhir';
    case 'last30':
      return 'dalam 30 hari terakhir';
    case 'custom':
      return 'pada rentang tanggal ini';
  }
}

import { jakartaDateKey, jakartaDayStart, jakartaDayStartOfKey } from '@/lib/time';

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

const DAY_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-08-10" → "20260810" when it is a real calendar date, otherwise null. */
function dayKey(input: string): string | null {
  const match = DAY_INPUT.exec(input);
  if (!match) return null;
  const key = `${match[1]}${match[2]}${match[3]}`;
  try {
    jakartaDayStartOfKey(key);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
  return key;
}

/** Number of whole Asia/Jakarta days in [from, to). Jakarta has no daylight saving, so a day is 24 hours. */
function countDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function toRange(from: Date, to: Date): ReportRange {
  const days = countDays(from, to);
  return { from: from.toISOString(), to: to.toISOString(), bucket: days === 1 ? 'hour' : 'day', days };
}

/** A message for an unusable custom range, or null when it is fine. */
export function validateCustomRange(fromDay: string, toDay: string): string | null {
  const from = dayKey(fromDay);
  const to = dayKey(toDay);
  if (from === null || to === null) return 'Isi tanggal awal dan tanggal akhir.';
  if (from > to) return 'Tanggal awal tidak boleh setelah tanggal akhir.';
  const days = countDays(jakartaDayStartOfKey(from), jakartaDayStartOfKey(to, 1));
  if (days > MAX_REPORT_DAYS) return `Rentang tanggal terlalu panjang (maksimal ${MAX_REPORT_DAYS} hari).`;
  return null;
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
      const problem = validateCustomRange(selection.fromDay, selection.toDay);
      if (problem) throw new RangeError(problem);
      const from = dayKey(selection.fromDay)!;
      const to = dayKey(selection.toDay)!;
      return toRange(jakartaDayStartOfKey(from), jakartaDayStartOfKey(to, 1));
    }
  }
}

/** Today's Asia/Jakarta date as "YYYY-MM-DD", plus an optional day offset; the value a date input takes. */
export function jakartaDayInput(now: Date, dayOffset = 0): string {
  const key = jakartaDateKey(jakartaDayStart(now, dayOffset));
  return `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`;
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

import { dayRangeInstants, jakartaDayStart, validateDayRange } from '@/lib/time';

/** Date filter choices (UI_SPEC A.15 "Hari Ini ▼"). Days are Asia/Jakarta days, never device days. */
export const DATE_PRESETS = ['today', 'yesterday', 'last7', 'last30', 'all', 'custom'] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Hari Ini',
  yesterday: 'Kemarin',
  last7: '7 Hari Terakhir',
  last30: '30 Hari Terakhir',
  all: 'Semua Tanggal',
  custom: 'Rentang Tanggal',
};

/** The longest custom range, the same limit as the report filter (UI_SPEC A.15, A.16). */
export const MAX_HISTORY_DAYS = 366;

/** What the user picked: a preset, or two "YYYY-MM-DD" days (both inclusive) for `custom`. */
export type DateSelection = { preset: Exclude<DatePreset, 'custom'> } | { preset: 'custom'; fromDay: string; toDay: string };

/** A message for an unusable custom range, or null when it is fine. */
export function validateHistoryRange(fromDay: string, toDay: string): string | null {
  return validateDayRange(fromDay, toDay, MAX_HISTORY_DAYS);
}

export function isDatePreset(value: string): value is DatePreset {
  return (DATE_PRESETS as readonly string[]).includes(value);
}

/** Sorting (PRD §19). */
export const HISTORY_ORDERS = ['newest', 'oldest'] as const;
export type HistoryOrder = (typeof HISTORY_ORDERS)[number];

export const ORDER_LABELS: Record<HistoryOrder, string> = { newest: 'Terbaru', oldest: 'Terlama' };

export function isHistoryOrder(value: string): value is HistoryOrder {
  return (HISTORY_ORDERS as readonly string[]).includes(value);
}

/** Sale-time window: `from` inclusive, `to` exclusive, both ISO 8601. A null side is open. */
export type DateRange = { from: string | null; to: string | null };

const OPEN_RANGE: DateRange = { from: null, to: null };

/**
 * The window a selection covers at `now`. "7 Hari" and "30 Hari" include today. A custom range
 * must be valid (check `validateHistoryRange` first); an unusable one throws a RangeError.
 */
export function dateRangeFor(selection: DateSelection, now: Date): DateRange {
  const startOf = (dayOffset: number) => jakartaDayStart(now, dayOffset).toISOString();
  switch (selection.preset) {
    case 'today':
      return { from: startOf(0), to: startOf(1) };
    case 'yesterday':
      return { from: startOf(-1), to: startOf(0) };
    case 'last7':
      return { from: startOf(-6), to: startOf(1) };
    case 'last30':
      return { from: startOf(-29), to: startOf(1) };
    case 'all':
      return OPEN_RANGE;
    case 'custom': {
      const { from, to } = dayRangeInstants(selection.fromDay, selection.toDay, MAX_HISTORY_DAYS);
      return { from: from.toISOString(), to: to.toISOString() };
    }
  }
}

/** True when the sale time falls inside the window. */
export function isInRange(createdAt: string, range: DateRange): boolean {
  const time = Date.parse(createdAt);
  if (range.from !== null && time < Date.parse(range.from)) return false;
  if (range.to !== null && time >= Date.parse(range.to)) return false;
  return true;
}

/**
 * The code search term: letters, digits, and "-" only, because a display code (TRX-YYYYMMDD-XXXXXX)
 * has no other characters. That also keeps SQL LIKE wildcards and PostgREST filter syntax out of
 * the query. Empty means "no search".
 */
export function normalizeSearch(raw: string): string {
  return raw.trim().replace(/[^A-Za-z0-9-]/g, '');
}

/** Case-insensitive "contains" on the display code, the same rule the server query applies (ilike). */
export function matchesCode(code: string, term: string): boolean {
  return term === '' || code.toUpperCase().includes(term.toUpperCase());
}

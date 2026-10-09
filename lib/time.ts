/** Business timezone for every business date: codes, reports, filters, day boundaries (TECHNICAL_SPEC C.13). */
export const BUSINESS_TIME_ZONE = 'Asia/Jakarta';

const JAKARTA_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Asia/Jakarta calendar date of an instant as "YYYYMMDD", whatever the device timezone is. */
export function jakartaDateKey(instant: Date): string {
  if (Number.isNaN(instant.getTime())) throw new RangeError('Invalid date.');
  const parts = JAKARTA_DATE.formatToParts(instant);
  const part = (type: 'year' | 'month' | 'day') => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}${part('month')}${part('day')}`;
}

const JAKARTA_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Asia/Jakarta clock time "HH:mm" (24-hour), e.g. "10:32". */
export function formatJakartaTime(instant: Date): string {
  if (Number.isNaN(instant.getTime())) throw new RangeError('Invalid date.');
  const parts = JAKARTA_CLOCK.formatToParts(instant);
  const part = (type: 'hour' | 'minute') => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('hour')}:${part('minute')}`;
}

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'] as const;

function parseDateKey(key: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(key);
  if (!match) throw new RangeError(`Date key must be "YYYYMMDD", got "${key}".`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // Date.UTC rolls an impossible date (31 February) over; reject it instead.
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new RangeError(`Date key "${key}" is not a real calendar date.`);
  }
  return { year, month, day };
}

/** "07/10/2026": the Asia/Jakarta date of an instant (day/month/year). */
export function formatJakartaDate(instant: Date): string {
  const key = jakartaDateKey(instant);
  return `${key.slice(6, 8)}/${key.slice(4, 6)}/${key.slice(0, 4)}`;
}

/** "Rabu, 7 Okt 2026": the Asia/Jakarta day of an instant, for list group headings. */
export function formatJakartaDay(instant: Date): string {
  const { year, month, day } = parseDateKey(jakartaDateKey(instant));
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${DAY_NAMES[weekday]}, ${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

// Asia/Jakarta is UTC+07:00 all year (no daylight saving since 1964), so a business day starts
// at a fixed offset from UTC midnight.
const JAKARTA_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The instant an Asia/Jakarta day begins (00:00 WIB). `dayOffset` moves by whole days: -1 is the day before. */
export function jakartaDayStart(instant: Date, dayOffset = 0): Date {
  const { year, month, day } = parseDateKey(jakartaDateKey(instant));
  return new Date(Date.UTC(year, month - 1, day) - JAKARTA_UTC_OFFSET_MS + dayOffset * DAY_MS);
}

/**
 * The instant the Asia/Jakarta day named by `key` ("YYYYMMDD") begins (00:00 WIB). `dayOffset` moves by
 * whole days. A date that does not exist (31 February) throws a RangeError.
 */
export function jakartaDayStartOfKey(key: string, dayOffset = 0): Date {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day) - JAKARTA_UTC_OFFSET_MS + dayOffset * DAY_MS);
}

/** "7 Okt": day and month of the Asia/Jakarta day an instant falls on, for compact chart labels. */
export function formatJakartaDayMonth(instant: Date): string {
  const { month, day } = parseDateKey(jakartaDateKey(instant));
  return `${day} ${MONTH_NAMES[month - 1]}`;
}

/**
 * "2026-10-07T10:32:00.000+07:00": an exact instant written in Asia/Jakarta wall-clock time, for
 * exports. Machine-readable (ISO 8601 with offset) and readable as a WIB time at the same time.
 */
export function formatJakartaTimestamp(instant: Date): string {
  if (Number.isNaN(instant.getTime())) throw new RangeError('Invalid date.');
  return `${new Date(instant.getTime() + JAKARTA_UTC_OFFSET_MS).toISOString().slice(0, -1)}+07:00`;
}

// ---------------------------------------------------------------------------
// Day ranges picked in date inputs ("YYYY-MM-DD", both days inclusive), shared by the report
// filter (UI_SPEC A.16) and the history filter (A.15). Days are Asia/Jakarta days.
// ---------------------------------------------------------------------------

const DAY_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-08-10" → "20260810" when it is a real calendar date, otherwise null. */
function dayInputKey(input: string): string | null {
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
export function countJakartaDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/** A message for an unusable day range, or null when it is fine. */
export function validateDayRange(fromDay: string, toDay: string, maxDays: number): string | null {
  const from = dayInputKey(fromDay);
  const to = dayInputKey(toDay);
  if (from === null || to === null) return 'Isi tanggal awal dan tanggal akhir.';
  if (from > to) return 'Tanggal awal tidak boleh setelah tanggal akhir.';
  const days = countJakartaDays(jakartaDayStartOfKey(from), jakartaDayStartOfKey(to, 1));
  if (days > maxDays) return `Rentang tanggal terlalu panjang (maksimal ${maxDays} hari).`;
  return null;
}

/** The instants [from, to) a valid day range covers. Throws a RangeError for an unusable one. */
export function dayRangeInstants(fromDay: string, toDay: string, maxDays: number): { from: Date; to: Date } {
  const problem = validateDayRange(fromDay, toDay, maxDays);
  if (problem) throw new RangeError(problem);
  return { from: jakartaDayStartOfKey(dayInputKey(fromDay)!), to: jakartaDayStartOfKey(dayInputKey(toDay)!, 1) };
}

/** Today's Asia/Jakarta date as "YYYY-MM-DD", plus an optional day offset; the value a date input takes. */
export function jakartaDayInput(now: Date, dayOffset = 0): string {
  const key = jakartaDateKey(jakartaDayStart(now, dayOffset));
  return `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`;
}

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

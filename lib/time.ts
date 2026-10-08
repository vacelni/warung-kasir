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

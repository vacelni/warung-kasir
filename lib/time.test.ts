import { afterEach, describe, expect, it } from 'vitest';
import { formatJakartaDate, formatJakartaDay, formatJakartaTime, jakartaDateKey, jakartaDayStart } from './time';

const originalTz = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTz;
});

describe('jakartaDateKey (TEST_PLAN G.17)', () => {
  it('counts a sale at 23:30 WIB on that WIB date', () => {
    expect(jakartaDateKey(new Date('2026-10-07T23:30:00+07:00'))).toBe('20261007');
  });

  it('counts a sale at 00:30 WIB on that WIB date, not the previous UTC date', () => {
    // 2026-10-07T17:30Z is still 7 October in UTC.
    expect(jakartaDateKey(new Date('2026-10-08T00:30:00+07:00'))).toBe('20261008');
  });

  it.each(['UTC', 'America/Los_Angeles', 'Asia/Tokyo'])('ignores the device timezone (%s)', (tz) => {
    process.env.TZ = tz;
    expect(jakartaDateKey(new Date('2026-10-07T17:30:00Z'))).toBe('20261008');
    expect(jakartaDateKey(new Date('2026-10-07T16:59:59Z'))).toBe('20261007');
  });

  it('pads month and day', () => {
    expect(jakartaDateKey(new Date('2027-01-05T08:00:00+07:00'))).toBe('20270105');
  });

  it('rejects an invalid date', () => {
    expect(() => jakartaDateKey(new Date('not a date'))).toThrow(RangeError);
  });
});

describe('Asia/Jakarta formatting (PRD §19–§20)', () => {
  it('formats the clock time in WIB, 24-hour', () => {
    expect(formatJakartaTime(new Date('2026-10-07T03:32:00Z'))).toBe('10:32');
    expect(formatJakartaTime(new Date('2026-10-07T17:05:00Z'))).toBe('00:05');
    expect(formatJakartaTime(new Date('2026-10-07T16:59:00Z'))).toBe('23:59');
  });

  it('formats the date as dd/mm/yyyy in WIB', () => {
    expect(formatJakartaDate(new Date('2026-10-07T03:32:00Z'))).toBe('07/10/2026');
    // 17:30Z on 7 Oct is already 8 Oct in Jakarta.
    expect(formatJakartaDate(new Date('2026-10-07T17:30:00Z'))).toBe('08/10/2026');
  });

  it('formats the day heading with the Indonesian weekday and month', () => {
    expect(formatJakartaDay(new Date('2026-10-07T03:32:00Z'))).toBe('Rabu, 7 Okt 2026');
    expect(formatJakartaDay(new Date('2027-01-05T08:00:00+07:00'))).toBe('Selasa, 5 Jan 2027');
    expect(formatJakartaDay(new Date('2026-08-17T08:00:00+07:00'))).toBe('Senin, 17 Agu 2026');
  });

  it.each(['UTC', 'America/Los_Angeles', 'Asia/Tokyo'])('ignores the device timezone (%s)', (tz) => {
    process.env.TZ = tz;
    const instant = new Date('2026-10-07T17:30:00Z');
    expect(formatJakartaTime(instant)).toBe('00:30');
    expect(formatJakartaDate(instant)).toBe('08/10/2026');
    expect(formatJakartaDay(instant)).toBe('Kamis, 8 Okt 2026');
  });

  it('rejects an invalid date', () => {
    expect(() => formatJakartaTime(new Date('nope'))).toThrow(RangeError);
    expect(() => formatJakartaDay(new Date('nope'))).toThrow(RangeError);
  });
});

describe('jakartaDayStart (TEST_PLAN G.17)', () => {
  it('starts the day at 00:00 WIB, which is 17:00Z the day before', () => {
    expect(jakartaDayStart(new Date('2026-10-07T10:32:00+07:00')).toISOString()).toBe('2026-10-06T17:00:00.000Z');
  });

  it('a sale at 23:30 WIB belongs to its WIB day; a sale at 00:30 WIB to the next one', () => {
    const start = jakartaDayStart(new Date('2026-10-07T12:00:00+07:00')).getTime();
    const nextStart = jakartaDayStart(new Date('2026-10-07T12:00:00+07:00'), 1).getTime();
    const late = new Date('2026-10-07T23:30:00+07:00').getTime();
    const early = new Date('2026-10-08T00:30:00+07:00').getTime();
    expect(late >= start && late < nextStart).toBe(true);
    expect(early >= nextStart).toBe(true);
  });

  it('moves by whole days, across month ends', () => {
    const now = new Date('2026-10-01T09:00:00+07:00');
    expect(jakartaDayStart(now, -1).toISOString()).toBe('2026-09-29T17:00:00.000Z');
    expect(jakartaDayStart(now, 1).toISOString()).toBe('2026-10-01T17:00:00.000Z');
    expect(jakartaDayStart(now, -29).toISOString()).toBe('2026-09-01T17:00:00.000Z');
  });

  it('uses the Jakarta date, not the device date, to pick the day', () => {
    process.env.TZ = 'America/Los_Angeles';
    // 18:00Z on 7 Oct is 01:00 on 8 Oct in Jakarta (and still 7 Oct in Los Angeles).
    expect(jakartaDayStart(new Date('2026-10-07T18:00:00Z')).toISOString()).toBe('2026-10-07T17:00:00.000Z');
  });
});

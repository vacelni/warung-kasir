import { afterEach, describe, expect, it } from 'vitest';
import { jakartaDayInput, MAX_REPORT_DAYS, reportRangeFor, validateCustomRange } from './range';

const originalTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTz;
});

// 2026-10-08 10:00 WIB
const NOW = new Date('2026-10-08T10:00:00+07:00');

describe('reportRangeFor: presets (PRD §21)', () => {
  it('"Hari Ini" is today in Jakarta, [00:00 WIB, next 00:00 WIB), grouped by hour', () => {
    expect(reportRangeFor({ period: 'today' }, NOW)).toEqual({
      from: '2026-10-07T17:00:00.000Z',
      to: '2026-10-08T17:00:00.000Z',
      bucket: 'hour',
      days: 1,
    });
  });

  it('"7 Hari" is today and the six days before, grouped by day', () => {
    expect(reportRangeFor({ period: 'last7' }, NOW)).toEqual({
      from: '2026-10-01T17:00:00.000Z',
      to: '2026-10-08T17:00:00.000Z',
      bucket: 'day',
      days: 7,
    });
  });

  it('"30 Hari" is today and the 29 days before', () => {
    const range = reportRangeFor({ period: 'last30' }, NOW);
    expect(range.from).toBe('2026-09-08T17:00:00.000Z');
    expect(range.to).toBe('2026-10-08T17:00:00.000Z');
    expect(range.days).toBe(30);
    expect(range.bucket).toBe('day');
  });

  it('starts the day at exactly 00:00 WIB and ends it one millisecond before the next', () => {
    const justAfterMidnight = new Date('2026-10-08T00:00:00+07:00');
    const justBeforeMidnight = new Date('2026-10-08T23:59:59.999+07:00');
    expect(reportRangeFor({ period: 'today' }, justAfterMidnight)).toEqual(
      reportRangeFor({ period: 'today' }, justBeforeMidnight),
    );
    // One millisecond earlier is still the previous Jakarta day.
    const previous = reportRangeFor({ period: 'today' }, new Date('2026-10-07T23:59:59.999+07:00'));
    expect(previous.to).toBe('2026-10-07T17:00:00.000Z');
  });

  it('crosses a month and a year boundary', () => {
    const range = reportRangeFor({ period: 'last7' }, new Date('2027-01-03T12:00:00+07:00'));
    expect(range.from).toBe('2026-12-27T17:00:00.000Z');
    expect(range.to).toBe('2027-01-03T17:00:00.000Z');
  });
});

describe('reportRangeFor: UTC device, Asia/Jakarta boundaries (TEST_PLAN G.17)', () => {
  it.each(['UTC', 'America/Los_Angeles', 'Asia/Tokyo'])('ignores the device timezone (%s)', (tz) => {
    process.env.TZ = tz;
    // 23:30 WIB on 7 Oct is 16:30Z on 7 Oct; 00:30 WIB on 8 Oct is 17:30Z on 7 Oct (still 7 Oct in UTC).
    const lateEvening = reportRangeFor({ period: 'today' }, new Date('2026-10-07T16:30:00Z'));
    const justAfterMidnight = reportRangeFor({ period: 'today' }, new Date('2026-10-07T17:30:00Z'));
    expect(lateEvening.from).toBe('2026-10-06T17:00:00.000Z');
    expect(justAfterMidnight.from).toBe('2026-10-07T17:00:00.000Z');
    expect(jakartaDayInput(new Date('2026-10-07T17:30:00Z'))).toBe('2026-10-08');
    expect(jakartaDayInput(new Date('2026-10-07T16:30:00Z'))).toBe('2026-10-07');
  });
});

describe('reportRangeFor: custom range', () => {
  it('covers both chosen days completely (end day inclusive)', () => {
    expect(reportRangeFor({ period: 'custom', fromDay: '2026-08-10', toDay: '2026-08-13' }, NOW)).toEqual({
      from: '2026-08-09T17:00:00.000Z',
      to: '2026-08-13T17:00:00.000Z',
      bucket: 'day',
      days: 4,
    });
  });

  it('a single chosen day is one day, grouped by hour', () => {
    const range = reportRangeFor({ period: 'custom', fromDay: '2026-08-10', toDay: '2026-08-10' }, NOW);
    expect(range).toEqual({
      from: '2026-08-09T17:00:00.000Z',
      to: '2026-08-10T17:00:00.000Z',
      bucket: 'hour',
      days: 1,
    });
  });

  it('does not depend on "now"', () => {
    const selection = { period: 'custom', fromDay: '2026-08-10', toDay: '2026-08-11' } as const;
    expect(reportRangeFor(selection, NOW)).toEqual(reportRangeFor(selection, new Date('2030-01-01T00:00:00Z')));
  });

  it('throws for an unusable range', () => {
    expect(() => reportRangeFor({ period: 'custom', fromDay: '2026-08-13', toDay: '2026-08-10' }, NOW)).toThrow(
      RangeError,
    );
  });
});

describe('validateCustomRange', () => {
  it('accepts a valid range, including one day and a leap day', () => {
    expect(validateCustomRange('2026-08-10', '2026-08-10')).toBeNull();
    expect(validateCustomRange('2028-02-28', '2028-03-01')).toBeNull();
  });

  it('asks for both dates when one is empty or malformed', () => {
    expect(validateCustomRange('', '2026-08-10')).toMatch(/Isi tanggal/);
    expect(validateCustomRange('2026-08-10', '')).toMatch(/Isi tanggal/);
    expect(validateCustomRange('10/08/2026', '2026-08-10')).toMatch(/Isi tanggal/);
  });

  it('rejects a day that does not exist', () => {
    expect(validateCustomRange('2026-02-31', '2026-03-05')).toMatch(/Isi tanggal/);
  });

  it('rejects an end before the start', () => {
    expect(validateCustomRange('2026-08-11', '2026-08-10')).toMatch(/setelah/);
  });

  it(`accepts exactly ${MAX_REPORT_DAYS} days and rejects one more`, () => {
    // 2027-01-01 .. 2027-12-31 is 365 days; 2028 is a leap year, so a full 2028 is 366.
    expect(validateCustomRange('2028-01-01', '2028-12-31')).toBeNull();
    expect(validateCustomRange('2028-01-01', '2029-01-01')).toMatch(/terlalu panjang/);
  });
});

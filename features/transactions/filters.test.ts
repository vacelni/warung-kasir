import { afterEach, describe, expect, it } from 'vitest';
import { dateRangeFor, isDatePreset, isHistoryOrder, isInRange, matchesCode, normalizeSearch } from './filters';

const originalTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTz;
});

// 10:32 WIB on Wednesday 7 October 2026.
const NOW = new Date('2026-10-07T10:32:00+07:00');

describe('dateRangeFor (Asia/Jakarta days, TEST_PLAN G.17)', () => {
  it('today is 00:00 WIB to 00:00 WIB the next day', () => {
    expect(dateRangeFor('today', NOW)).toEqual({ from: '2026-10-06T17:00:00.000Z', to: '2026-10-07T17:00:00.000Z' });
  });

  it('yesterday is the day before', () => {
    expect(dateRangeFor('yesterday', NOW)).toEqual({ from: '2026-10-05T17:00:00.000Z', to: '2026-10-06T17:00:00.000Z' });
  });

  it('7 and 30 days include today', () => {
    expect(dateRangeFor('last7', NOW)).toEqual({ from: '2026-09-30T17:00:00.000Z', to: '2026-10-07T17:00:00.000Z' });
    expect(dateRangeFor('last30', NOW)).toEqual({ from: '2026-09-07T17:00:00.000Z', to: '2026-10-07T17:00:00.000Z' });
  });

  it('all dates is open on both sides', () => {
    expect(dateRangeFor('all', NOW)).toEqual({ from: null, to: null });
  });

  it.each(['UTC', 'America/Los_Angeles', 'Asia/Tokyo'])('does not depend on the device timezone (%s)', (tz) => {
    process.env.TZ = tz;
    expect(dateRangeFor('today', NOW)).toEqual({ from: '2026-10-06T17:00:00.000Z', to: '2026-10-07T17:00:00.000Z' });
  });

  it('at 00:30 WIB "today" is already the new WIB day, though UTC is still the old one', () => {
    const justAfterMidnight = new Date('2026-10-08T00:30:00+07:00');
    expect(dateRangeFor('today', justAfterMidnight).from).toBe('2026-10-07T17:00:00.000Z');
  });
});

describe('isInRange', () => {
  const today = dateRangeFor('today', NOW);

  it('counts a sale at 23:30 WIB on its own day', () => {
    expect(isInRange('2026-10-07T23:30:00+07:00', today)).toBe(true);
  });

  it('counts a sale at 00:30 WIB on the next day, not the previous UTC date', () => {
    expect(isInRange('2026-10-08T00:30:00+07:00', today)).toBe(false);
    const nextDay = dateRangeFor('today', new Date('2026-10-08T09:00:00+07:00'));
    expect(isInRange('2026-10-08T00:30:00+07:00', nextDay)).toBe(true);
  });

  it('includes the start and excludes the end', () => {
    expect(isInRange(today.from!, today)).toBe(true);
    expect(isInRange(today.to!, today)).toBe(false);
  });

  it('an open range accepts everything', () => {
    expect(isInRange('1999-01-01T00:00:00Z', dateRangeFor('all', NOW))).toBe(true);
  });
});

describe('normalizeSearch', () => {
  it('trims and keeps code characters', () => {
    expect(normalizeSearch('  TRX-20261007-3F9A2C ')).toBe('TRX-20261007-3F9A2C');
    expect(normalizeSearch('3f9a')).toBe('3f9a');
  });

  it('drops anything that cannot be in a display code, so wildcards and filter syntax never reach the query', () => {
    expect(normalizeSearch('50%_off')).toBe('50off');
    expect(normalizeSearch('a,b)(c')).toBe('abc');
    expect(normalizeSearch('"; drop')).toBe('drop');
    expect(normalizeSearch('   ')).toBe('');
  });
});

describe('matchesCode', () => {
  it('matches part of the code, ignoring case', () => {
    expect(matchesCode('TRX-20261007-3F9A2C', '3f9a')).toBe(true);
    expect(matchesCode('TRX-20261007-3F9A2C', 'trx-2026')).toBe(true);
    expect(matchesCode('TRX-20261007-3F9A2C', '8C41')).toBe(false);
  });

  it('an empty term matches every code', () => {
    expect(matchesCode('TRX-20261007-3F9A2C', '')).toBe(true);
  });
});

describe('type guards', () => {
  it('accept only known values', () => {
    expect(isDatePreset('today')).toBe(true);
    expect(isDatePreset('custom')).toBe(false);
    expect(isHistoryOrder('oldest')).toBe(true);
    expect(isHistoryOrder('random')).toBe(false);
  });
});

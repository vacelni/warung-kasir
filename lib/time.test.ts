import { afterEach, describe, expect, it } from 'vitest';
import { jakartaDateKey } from './time';

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

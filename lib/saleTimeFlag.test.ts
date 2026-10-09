import { describe, expect, it } from 'vitest';
import { FUTURE_TOLERANCE_MS, LATE_SYNC_MS, saleTimeFlag } from './saleTimeFlag';

const RECEIVED = '2026-10-07T03:32:00.000Z';
const at = (offsetMs: number) => new Date(Date.parse(RECEIVED) + offsetMs).toISOString();

describe('saleTimeFlag (SEC-06)', () => {
  it('uses the agreed thresholds: 5 minutes ahead, 24 hours late', () => {
    expect(FUTURE_TOLERANCE_MS).toBe(300_000);
    expect(LATE_SYNC_MS).toBe(86_400_000);
  });

  it('does not flag a sale synced right away, or a little before/after the server time', () => {
    expect(saleTimeFlag(at(0), RECEIVED)).toBeNull();
    expect(saleTimeFlag(at(-60_000), RECEIVED)).toBeNull();
    expect(saleTimeFlag(at(60_000), RECEIVED)).toBeNull();
  });

  it('flags a sale dated more than 5 minutes after the server received it (boundary exclusive)', () => {
    expect(saleTimeFlag(at(FUTURE_TOLERANCE_MS), RECEIVED)).toBeNull();
    expect(saleTimeFlag(at(FUTURE_TOLERANCE_MS + 1), RECEIVED)).toBe('future');
    expect(saleTimeFlag(at(30 * 24 * 3_600_000), RECEIVED)).toBe('future'); // far ahead is still "future"
  });

  it('flags a sale received more than 24 hours after it was made (boundary exclusive)', () => {
    expect(saleTimeFlag(at(-LATE_SYNC_MS), RECEIVED)).toBeNull();
    expect(saleTimeFlag(at(-LATE_SYNC_MS - 1), RECEIVED)).toBe('late');
  });

  it('never flags a sale the server has not received, or unreadable times', () => {
    expect(saleTimeFlag(at(-10 * LATE_SYNC_MS), null)).toBeNull();
    expect(saleTimeFlag('not a date', RECEIVED)).toBeNull();
  });

  it('compares instants, whatever the offset notation', () => {
    expect(saleTimeFlag('2026-10-07T10:38:00+07:00', '2026-10-07T03:32:00+00:00')).toBe('future');
    expect(saleTimeFlag('2026-10-07T10:36:00+07:00', '2026-10-07T03:32:00Z')).toBeNull();
  });
});

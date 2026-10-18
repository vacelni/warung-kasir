import { describe, expect, it } from 'vitest';
import type { OutboxEntry } from '@/features/offline/outbox';
import { testSnapshot } from '@/lib/test-support/transactions';
import {
  detailFromOutbox,
  fromOutbox,
  groupByDay,
  isUnsynced,
  mergeHistory,
  sortLines,
  type HistoryEntry,
} from './model';

function outbox(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return { ...testSnapshot(), sync_status: 'pending', attempts: 0, last_error: null, last_attempt_at: null, ...overrides };
}

function serverEntry(id: string, createdAt: string, overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id,
    code: `TRX-X-${id.toUpperCase()}`,
    createdAt,
    total: 10000,
    paidAmount: 10000,
    changeAmount: 0,
    cashierId: 'cashier-1',
    cashierName: 'Andi',
    itemCount: 1,
    source: 'server',
    serverStatus: 'completed',
    syncStatus: null,
    syncedAt: createdAt,
    ...overrides,
  };
}

function localEntry(id: string, createdAt: string, status: OutboxEntry['sync_status']): HistoryEntry {
  return fromOutbox(outbox({ id, created_at: createdAt, sync_status: status, code: `TRX-X-${id.toUpperCase()}` }), 'Andi');
}

const ids = (entries: HistoryEntry[]) => entries.map((entry) => entry.id);

describe('fromOutbox', () => {
  it('keeps the UUID, code, sale time, amounts and cashier, and the device sync state', () => {
    const entry = fromOutbox(outbox({ sync_status: 'failed' }), 'Andi');

    expect(entry).toEqual({
      id: '3f9a2c4e-7b1d-4c2a-9e10-000000000001',
      code: 'TRX-20261007-3F9A2C',
      createdAt: '2026-10-07T03:32:00.000Z',
      total: 40000,
      paidAmount: 50000,
      changeAmount: 10000,
      cashierId: 'cashier-1',
      cashierName: 'Andi',
      itemCount: 4,
      source: 'local',
      serverStatus: null,
      syncStatus: 'failed',
      syncedAt: null,
    });
  });

  it('keeps server status and sync status as separate fields: a local sale has no server status yet', () => {
    const entry = fromOutbox(outbox(), 'Andi');
    expect(entry.serverStatus).toBeNull();
    expect(entry.syncStatus).toBe('pending');
  });
});

describe('detailFromOutbox', () => {
  it('uses the sale snapshot, sorted by name, with unit price and subtotal as sold', () => {
    const detail = detailFromOutbox(outbox(), 'Andi');

    expect(detail.lines).toEqual([
      { productName: 'Es Teh', unitPrice: 5000, quantity: 2, subtotal: 10000, options: [], note: null },
      { productName: 'Nasi Goreng', unitPrice: 15000, quantity: 2, subtotal: 30000, options: [], note: null },
    ]);
    expect(detail.createdAt).toBe('2026-10-07T03:32:00.000Z');
  });
});

describe('sortLines', () => {
  it('orders by name and does not change its input', () => {
    const lines = [
      { productName: 'Teh', unitPrice: 1, quantity: 1, subtotal: 1, options: [], note: null },
      { productName: 'Air', unitPrice: 1, quantity: 1, subtotal: 1, options: [], note: null },
    ];
    expect(sortLines(lines).map((line) => line.productName)).toEqual(['Air', 'Teh']);
    expect(lines[0]?.productName).toBe('Teh');
  });
});

describe('isUnsynced', () => {
  it('is true for pending, syncing and failed device entries only', () => {
    expect(isUnsynced(localEntry('a', '2026-10-07T03:00:00Z', 'pending'))).toBe(true);
    expect(isUnsynced(localEntry('a', '2026-10-07T03:00:00Z', 'syncing'))).toBe(true);
    expect(isUnsynced(localEntry('a', '2026-10-07T03:00:00Z', 'failed'))).toBe(true);
    expect(isUnsynced(localEntry('a', '2026-10-07T03:00:00Z', 'synced'))).toBe(false);
    expect(isUnsynced(serverEntry('a', '2026-10-07T03:00:00Z'))).toBe(false);
  });
});

describe('mergeHistory (server + local pending, deduplicated by UUID)', () => {
  const T1 = '2026-10-07T01:00:00.000Z';
  const T2 = '2026-10-07T02:00:00.000Z';
  const T3 = '2026-10-07T03:00:00.000Z';
  const T4 = '2026-10-07T04:00:00.000Z';

  it('shows a pending local sale the server does not have, in sale-time order', () => {
    const merged = mergeHistory({
      server: [serverEntry('s2', T2), serverEntry('s1', T1)],
      local: [localEntry('p3', T3, 'pending')],
      order: 'newest',
      hasMore: false,
    });

    expect(ids(merged)).toEqual(['p3', 's2', 's1']);
    expect(merged[0]).toMatchObject({ source: 'local', syncStatus: 'pending', serverStatus: null });
  });

  it('converges to the server row once the sale is on the server: no duplicate, whatever the outbox says', () => {
    for (const status of ['pending', 'syncing', 'failed', 'synced'] as const) {
      const merged = mergeHistory({
        server: [serverEntry('same', T2)],
        local: [localEntry('same', T2, status)],
        order: 'newest',
        hasMore: false,
      });

      expect(ids(merged)).toEqual(['same']);
      expect(merged[0]).toMatchObject({ source: 'server', serverStatus: 'completed', syncStatus: null });
    }
  });

  it('matches by UUID only, never by code, time or amount', () => {
    const server = serverEntry('server-id', T2, { code: 'TRX-SAME', total: 40000 });
    const local = { ...localEntry('local-id', T2, 'pending'), code: 'TRX-SAME', total: 40000 };

    expect(ids(mergeHistory({ server: [server], local: [local], order: 'newest', hasMore: false }))).toEqual([
      'server-id',
      'local-id',
    ]);
  });

  it('keeps a failed sale visible', () => {
    const merged = mergeHistory({ server: [], local: [localEntry('f', T1, 'failed')], order: 'newest', hasMore: false });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.syncStatus).toBe('failed');
  });

  it('keeps the server rows in exactly the order the database returned them', () => {
    // Equal sale times: the database ordered them by id descending; the merge must not reshuffle.
    const server = [serverEntry('c', T2), serverEntry('b', T2), serverEntry('a', T2)];
    expect(ids(mergeHistory({ server, local: [], order: 'newest', hasMore: false }))).toEqual(['c', 'b', 'a']);
  });

  it('sorts oldest first when asked', () => {
    const merged = mergeHistory({
      server: [serverEntry('s1', T1), serverEntry('s2', T2)],
      local: [localEntry('p3', T3, 'pending'), localEntry('p0', '2026-10-07T00:00:00.000Z', 'pending')],
      order: 'oldest',
      hasMore: false,
    });
    expect(ids(merged)).toEqual(['p0', 's1', 's2', 'p3']);
  });

  describe('while more server pages remain', () => {
    it('shows a local copy of a synced sale only inside the loaded window (newest first)', () => {
      const merged = mergeHistory({
        server: [serverEntry('s4', T4), serverEntry('s2', T2)],
        local: [localEntry('inside', T3, 'synced'), localEntry('older', T1, 'synced')],
        order: 'newest',
        hasMore: true,
      });
      // "older" is below the oldest loaded row (T2): a later page will bring it from the server.
      expect(ids(merged)).toEqual(['s4', 'inside', 's2']);
    });

    it('at an equal sale time, a smaller id belongs to the next page, exactly like the server cursor', () => {
      const merged = mergeHistory({
        server: [serverEntry('s3', T3)],
        local: [localEntry('a-next-page', T3, 'synced')],
        order: 'newest',
        hasMore: true,
      });
      expect(ids(merged)).toEqual(['s3']);
    });

    it('applies the same window oldest first', () => {
      const merged = mergeHistory({
        server: [serverEntry('s1', T1), serverEntry('s2', T2)],
        local: [localEntry('newer', T4, 'synced'), localEntry('inside', T1, 'synced')],
        order: 'oldest',
        hasMore: true,
      });
      expect(ids(merged)).toEqual(['inside', 's1', 's2']);
    });

    it('never hides an unsynced sale, however old', () => {
      const merged = mergeHistory({
        server: [serverEntry('s4', T4), serverEntry('s3', T3)],
        local: [localEntry('old-failed', T1, 'failed'), localEntry('old-pending', T2, 'pending')],
        order: 'newest',
        hasMore: true,
      });
      expect(ids(merged)).toEqual(['s4', 's3', 'old-pending', 'old-failed']);
    });

    it('shows local sales when no server row is loaded yet', () => {
      const merged = mergeHistory({ server: [], local: [localEntry('p', T1, 'synced')], order: 'newest', hasMore: true });
      expect(ids(merged)).toEqual(['p']);
    });
  });
});

describe('groupByDay (Asia/Jakarta)', () => {
  it('groups by WIB day: 23:30 WIB and 00:30 WIB are different days even though UTC would merge them', () => {
    const entries = [
      serverEntry('late', '2026-10-08T00:30:00+07:00'),
      serverEntry('mid', '2026-10-07T23:30:00+07:00'),
      serverEntry('morning', '2026-10-07T10:32:00+07:00'),
    ];

    const groups = groupByDay(entries);

    expect(groups.map((group) => [group.dayKey, group.label, ids(group.entries)])).toEqual([
      ['20261008', 'Kamis, 8 Okt 2026', ['late']],
      ['20261007', 'Rabu, 7 Okt 2026', ['mid', 'morning']],
    ]);
  });

  it('returns no groups for no entries', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('options on a sold line (DATABASE D.12)', () => {
  const geprek = (level: string, price = 0) => ({
    product_id: 'geprek',
    product_name: 'Geprek',
    unit_price: 12000 + price,
    quantity: 1,
    subtotal: 12000 + price,
    options: [{ group: 'Level', name: level, price }],
    note: null,
  });

  it('carries the chosen options and the note from the device copy of the sale', () => {
    const entry = outbox({
      items: [{ ...geprek('Level 3'), note: 'sambal dipisah' }],
      total: 12000,
      paid_amount: 15000,
      change_amount: 3000,
    });
    expect(detailFromOutbox(entry, 'Andi').lines).toEqual([
      {
        productName: 'Geprek',
        unitPrice: 12000,
        quantity: 1,
        subtotal: 12000,
        options: [{ group: 'Level', name: 'Level 3', price: 0 }],
        note: 'sambal dipisah',
      },
    ]);
  });

  it('reads a sale saved before options existed as a line with no options and no note', () => {
    const legacy = outbox({
      items: [{ product_id: 'nasi', product_name: 'Nasi Goreng', unit_price: 15000, quantity: 1, subtotal: 15000 }],
    });
    expect(detailFromOutbox(legacy, 'Andi').lines[0]).toMatchObject({ options: [], note: null });
  });

  it('keeps lines of the same product in a fixed order by price, then by choices', () => {
    const lines = [geprek('Level 5', 3000), geprek('Level 5'), geprek('Level 1')].map((item) => ({
      productName: item.product_name,
      unitPrice: item.unit_price,
      quantity: item.quantity,
      subtotal: item.subtotal,
      options: item.options,
      note: item.note,
    }));
    expect(sortLines(lines).map((line) => [line.unitPrice, line.options[0]?.name])).toEqual([
      [12000, 'Level 1'],
      [12000, 'Level 5'],
      [15000, 'Level 5'],
    ]);
  });
});

'use client';

import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { SearchBar } from '@/components/ui/SearchBar';
import { DateRangeFields } from '@/components/ui/DateRangeFields';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  DATE_PRESETS,
  DATE_PRESET_LABELS,
  HISTORY_ORDERS,
  ORDER_LABELS,
  isDatePreset,
  isHistoryOrder,
  normalizeSearch,
  validateHistoryRange,
  type DatePreset,
  type HistoryOrder,
} from './filters';
import { useProfile } from '@/features/auth/AuthProvider';
import { jakartaDayInput } from '@/lib/time';
import { groupByDay } from './model';
import { TransactionCard } from './TransactionCard';
import { useTransactions } from './useTransactions';

/** Wait for a pause in typing before asking the server, so a code is not searched letter by letter. */
const SEARCH_DEBOUNCE_MS = 300;

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

const PERIOD_PHRASES: Record<DatePreset, string> = {
  today: ' hari ini',
  yesterday: ' kemarin',
  last7: ' dalam 7 hari terakhir',
  last30: ' dalam 30 hari terakhir',
  all: '',
  custom: ' pada rentang tanggal ini',
};

/** The history screen: search by code, date filter, sort, the merged list, and "load more" (UI_SPEC A.15). */
export function HistoryList() {
  const isOwner = useProfile().role === 'owner';
  const [searchInput, setSearchInput] = useState('');
  const [preset, setPreset] = useState<DatePreset>('today');
  const [fromDay, setFromDay] = useState(() => jakartaDayInput(new Date(), -6));
  const [toDay, setToDay] = useState(() => jakartaDayInput(new Date()));
  // An unusable custom range is explained and nothing is loaded for it: the query keeps the last
  // valid range, and the list is hidden behind the message (UI_SPEC A.15).
  const rangeError = preset === 'custom' ? validateHistoryRange(fromDay, toDay) : null;
  const [applied, setApplied] = useState({ fromDay, toDay });
  function changeRange(nextFrom: string, nextTo: string) {
    setFromDay(nextFrom);
    setToDay(nextTo);
    if (validateHistoryRange(nextFrom, nextTo) === null) setApplied({ fromDay: nextFrom, toDay: nextTo });
  }
  const [order, setOrder] = useState<HistoryOrder>('newest');
  const search = useDebounced(normalizeSearch(searchInput), SEARCH_DEBOUNCE_MS);

  const { status, items, hasMore, loadingMore, loadMoreFailed, loadMore, retry } = useTransactions({
    preset,
    fromDay: applied.fromDay,
    toDay: applied.toDay,
    order,
    search,
  });
  const groups = useMemo(() => groupByDay(items), [items]);

  return (
    <>
      <PageHeader title="Riwayat" />

      {/* A readable column on wide screens; on a phone it is simply the full width. */}
      <div className="max-w-2xl">
        <div className="mb-4 flex flex-col gap-3">
          <SearchBar
            value={searchInput}
            onChange={setSearchInput}
            label="Cari kode transaksi"
            placeholder="Cari kode transaksi"
          />
          <div className="grid grid-cols-2 gap-3">
            <FilterSelect
              label="Filter tanggal"
              value={preset}
              onChange={(value) => {
                if (isDatePreset(value)) setPreset(value);
              }}
              options={DATE_PRESETS.map((value) => ({ value, label: DATE_PRESET_LABELS[value] }))}
            />
            <FilterSelect
              label="Urutan"
              value={order}
              onChange={(value) => {
                if (isHistoryOrder(value)) setOrder(value);
              }}
              options={HISTORY_ORDERS.map((value) => ({ value, label: ORDER_LABELS[value] }))}
            />
          </div>
          {preset === 'custom' && (
            <DateRangeFields
              fromDay={fromDay}
              toDay={toDay}
              onFromDayChange={(day) => changeRange(day, toDay)}
              onToDayChange={(day) => changeRange(fromDay, day)}
              error={rangeError}
            />
          )}
        </div>

        {rangeError === null && (
          <>

            {status === 'loading' && (
              <div role="status" aria-label="Memuat riwayat" aria-busy="true" className="flex flex-col gap-3">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-24 rounded-card" />
                ))}
              </div>
            )}

            {status === 'error' && items.length === 0 && (
              <ErrorState
                title="Riwayat gagal dimuat"
                description="Daftar transaksi tidak dapat diambil dari server. Transaksi yang sudah tersimpan di perangkat ini tidak hilang. Periksa koneksi internet lalu coba lagi."
                actions={<Button onClick={retry}>COBA LAGI</Button>}
              />
            )}

            {status === 'error' && items.length > 0 && (
              <Alert tone="warning" className="mb-4 flex flex-col gap-3">
                <p>Riwayat dari server tidak dapat dimuat. Yang tampil hanya transaksi yang tersimpan di perangkat ini.</p>
                <Button variant="secondary" onClick={retry}>
                  COBA LAGI
                </Button>
              </Alert>
            )}

            {status === 'ready' && items.length === 0 && (
              <EmptyHistory
                searching={search !== ''}
                preset={preset}
                search={search}
                onClearSearch={() => setSearchInput('')}
                onShowAllDates={() => setPreset('all')}
              />
            )}

            {items.length > 0 && (
              <div className="flex flex-col gap-5">
                {groups.map((group) => (
                  <section key={group.dayKey} aria-labelledby={`hari-${group.dayKey}`} className="flex flex-col gap-3">
                    <h2 id={`hari-${group.dayKey}`} className="text-body font-semibold text-muted">
                      {group.label}
                    </h2>
                    <ul className="flex flex-col gap-3">
                      {group.entries.map((entry) => (
                        <li key={entry.id}>
                          <TransactionCard entry={entry} showTimeFlag={isOwner} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}

                {loadMoreFailed && (
                  <Alert tone="danger" className="flex flex-col gap-3">
                    <p>Transaksi berikutnya gagal dimuat. Periksa koneksi internet lalu coba lagi.</p>
                    <Button variant="secondary" onClick={loadMore}>
                      COBA LAGI
                    </Button>
                  </Alert>
                )}

                {hasMore && !loadMoreFailed && (
                  <Button variant="secondary" className="w-full" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? 'MEMUAT…' : 'MUAT LEBIH BANYAK'}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

type FilterSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
};

function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-12 w-full min-w-0 rounded-control border border-border-strong bg-surface px-3 text-base text-foreground focus:border-primary"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

type EmptyHistoryProps = {
  searching: boolean;
  preset: DatePreset;
  search: string;
  onClearSearch: () => void;
  onShowAllDates: () => void;
};

function EmptyHistory({ searching, preset, search, onClearSearch, onShowAllDates }: EmptyHistoryProps) {
  if (searching) {
    return (
      <EmptyState
        icon="search"
        title="Transaksi tidak ditemukan"
        description={`Tidak ada transaksi dengan kode "${search}"${PERIOD_PHRASES[preset]}.`}
        actions={
          <Button variant="secondary" onClick={onClearSearch}>
            HAPUS PENCARIAN
          </Button>
        }
      />
    );
  }
  if (preset !== 'all') {
    return (
      <EmptyState
        title="Belum ada transaksi"
        description={`Belum ada transaksi${PERIOD_PHRASES[preset]}.`}
        actions={
          <Button variant="secondary" onClick={onShowAllDates}>
            TAMPILKAN SEMUA TANGGAL
          </Button>
        }
      />
    );
  }
  return <EmptyState title="Belum ada transaksi" description="Transaksi yang disimpan akan muncul di sini." />;
}

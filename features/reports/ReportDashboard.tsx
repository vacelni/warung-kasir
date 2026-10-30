'use client';

import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { AiInsightCard } from './AiInsightCard';
import { AI_INSIGHT_ENABLED } from './insight';
import { describeRange, hasNoSales } from './model';
import { PeriodFilter } from './PeriodFilter';
import { jakartaDayInput, periodPhrase, validateCustomRange, type ReportPeriod, type ReportSelection } from './range';
import { SalesChart } from './SalesChart';
import { SummaryGrid } from './SummaryGrid';
import { TopProducts } from './TopProducts';
import { useReport } from './useReport';

/** The owner dashboard: four metrics, sales chart, best sellers, and the time filter (UI_SPEC A.16). */
export function ReportDashboard() {
  const [period, setPeriod] = useState<ReportPeriod>('today');
  // The custom fields start on the last 7 days so choosing Custom shows something useful at once.
  const [fromDay, setFromDay] = useState(() => jakartaDayInput(new Date(), -6));
  const [toDay, setToDay] = useState(() => jakartaDayInput(new Date()));

  const customError = period === 'custom' ? validateCustomRange(fromDay, toDay) : null;
  const selection = useMemo<ReportSelection | null>(() => {
    if (period !== 'custom') return { period };
    return validateCustomRange(fromDay, toDay) === null ? { period, fromDay, toDay } : null;
  }, [period, fromDay, toDay]);

  const { status, report, range, retry } = useReport(selection);

  return (
    <>
      <PageHeader title="Laporan" description={range && status === 'ready' ? describeRange(range) : undefined} />

      <div className="flex max-w-4xl flex-col gap-5">
        <PeriodFilter
          period={period}
          onPeriodChange={setPeriod}
          fromDay={fromDay}
          toDay={toDay}
          onFromDayChange={setFromDay}
          onToDayChange={setToDay}
          customError={customError}
        />

        {status === 'loading' && <ReportSkeleton />}

        {status === 'error' && (
          <ErrorState
            title="Laporan gagal dimuat"
            description="Data penjualan tidak dapat diambil dari server, jadi angka tidak ditampilkan. Laporan membutuhkan koneksi internet. Transaksi di perangkat ini tidak terpengaruh."
            actions={<Button onClick={retry}>COBA LAGI</Button>}
          />
        )}

        {status === 'ready' && selection && range && (
          <>
            <SummaryGrid summary={report.summary} />

            {AI_INSIGHT_ENABLED && !hasNoSales(report) && <AiInsightCard key={`${range.from}|${range.to}`} range={range} />}

            <section aria-labelledby="penjualan" className="flex flex-col gap-3">
              <h2 id="penjualan" className="text-section-title font-semibold text-foreground">
                Penjualan
              </h2>
              <Card className="min-w-0">
                {hasNoSales(report) ? (
                  <p className="py-10 text-center text-base text-muted">
                    Belum ada penjualan {periodPhrase(selection)}.
                  </p>
                ) : (
                  <SalesChart points={report.series} bucket={range.bucket} />
                )}
              </Card>
            </section>

            <section aria-labelledby="menu-terlaris" className="flex flex-col gap-3">
              <h2 id="menu-terlaris" className="text-section-title font-semibold text-foreground">
                Menu Terlaris
              </h2>
              <Card>
                {report.topProducts.length === 0 ? (
                  <EmptyState
                    headingLevel={3}
                    title="Belum ada menu terjual"
                    description={`Tidak ada menu yang terjual ${periodPhrase(selection)}.`}
                  />
                ) : (
                  <TopProducts products={report.topProducts} />
                )}
              </Card>
            </section>
          </>
        )}
      </div>
    </>
  );
}

function ReportSkeleton() {
  return (
    <div role="status" aria-label="Memuat laporan" aria-busy="true" className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-20 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-52 rounded-card" />
      <Skeleton className="h-40 rounded-card" />
    </div>
  );
}

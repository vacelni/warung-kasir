import { formatJakartaDate, formatJakartaDay, formatJakartaDayMonth, formatJakartaTime } from '@/lib/time';
import type { ReportBucket, ReportRange } from './range';

/** The four dashboard metrics (PRD §21). Money is integer Rupiah. */
export type SalesSummary = {
  revenue: number;
  transactionCount: number;
  itemCount: number;
  /** Math.round(revenue / transactionCount), computed by the database; 0 with no sales. */
  averageAmount: number;
};

/** One chart bucket. `start` is the ISO instant the Asia/Jakarta hour or day begins. */
export type SeriesPoint = { start: string; revenue: number; transactionCount: number };

export type TopProduct = { productId: string; productName: string; quantity: number; revenue: number };

export type Report = {
  summary: SalesSummary;
  series: SeriesPoint[];
  topProducts: TopProduct[];
};

function wholeNumber(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`The report returned an invalid ${what}.`);
  }
  return value;
}

type SummaryRow = { revenue: number; transaction_count: number; item_count: number; average_amount: number };

/** The summary function always returns exactly one row; anything else is a broken response, not "no sales". */
export function toSummary(rows: readonly SummaryRow[] | null): SalesSummary {
  const row = rows?.[0];
  if (!rows || rows.length !== 1 || !row) throw new Error('The report returned an unexpected summary.');
  return {
    revenue: wholeNumber(row.revenue, 'omzet'),
    transactionCount: wholeNumber(row.transaction_count, 'transaction count'),
    itemCount: wholeNumber(row.item_count, 'item count'),
    averageAmount: wholeNumber(row.average_amount, 'average'),
  };
}

export function toSeries(rows: ReadonlyArray<{ bucket_start: string; revenue: number; transaction_count: number }> | null): SeriesPoint[] {
  if (!rows) throw new Error('The report returned no sales series.');
  return rows.map((row) => {
    if (Number.isNaN(Date.parse(row.bucket_start))) throw new Error('The report returned an invalid chart time.');
    return {
      start: row.bucket_start,
      revenue: wholeNumber(row.revenue, 'chart revenue'),
      transactionCount: wholeNumber(row.transaction_count, 'chart count'),
    };
  });
}

export function toTopProducts(
  rows: ReadonlyArray<{ product_id: string; product_name: string; quantity: number; revenue: number }> | null,
): TopProduct[] {
  if (!rows) throw new Error('The report returned no best sellers.');
  return rows.map((row) => ({
    productId: row.product_id,
    productName: row.product_name,
    quantity: wholeNumber(row.quantity, 'quantity'),
    revenue: wholeNumber(row.revenue, 'product revenue'),
  }));
}

/** True when nothing was sold in the window: the dashboard then shows its empty states. */
export function hasNoSales(report: Report): boolean {
  return report.summary.transactionCount === 0;
}

/** Label for a chart bucket in Asia/Jakarta time: "14:00" for an hour bucket, "10 Agu" for a day. */
export function bucketLabel(start: string, bucket: ReportBucket): string {
  const instant = new Date(start);
  return bucket === 'hour' ? formatJakartaTime(instant) : formatJakartaDayMonth(instant);
}

/**
 * Indexes of the buckets that get an axis label: at most `max`, always the first, evenly spread, so
 * 366 daily bars do not print 366 overlapping labels.
 */
export function labelIndexes(count: number, max: number): number[] {
  if (count <= 0 || max <= 0) return [];
  if (count <= max) return Array.from({ length: count }, (_, index) => index);
  if (max === 1) return [0];
  const picked = new Set<number>();
  for (let step = 0; step < max; step += 1) picked.add(Math.round((step * (count - 1)) / (max - 1)));
  return [...picked];
}

/** The days a report covers, in Asia/Jakarta: "Kamis, 8 Okt 2026" for one day, "10/08/2026 – 13/08/2026" for several. */
export function describeRange(range: ReportRange): string {
  const first = new Date(range.from);
  if (range.days === 1) return formatJakartaDay(first);
  const last = new Date(Date.parse(range.to) - 1);
  return `${formatJakartaDate(first)} – ${formatJakartaDate(last)}`;
}

/** Bar height in [0, plotHeight]. A sale always gets at least 1 unit so it never disappears; no sale gets none. */
export function barHeight(revenue: number, maxRevenue: number, plotHeight: number): number {
  if (revenue <= 0 || maxRevenue <= 0) return 0;
  return Math.max(1, (revenue / maxRevenue) * plotHeight);
}

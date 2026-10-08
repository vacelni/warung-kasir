import { getSupabase } from '@/lib/supabase';
import { toSeries, toSummary, toTopProducts, type Report } from './model';
import type { ReportRange } from './range';

/** Best sellers shown on the dashboard (UI_SPEC A.16 shows the top three; five fit a phone screen). */
export const TOP_PRODUCT_COUNT = 5;

/** A hung request is a failed one: the screen offers COBA LAGI instead of loading forever. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * The whole dashboard for one window: three aggregate calls sent together. The database sums,
 * counts and ranks (owner only, completed sales only, Asia/Jakarta days); the browser never
 * receives individual transactions. No automatic retry, so an offline owner sees the error fast.
 */
export async function getReport(range: ReportRange): Promise<Report> {
  const window = { p_from: range.from, p_to: range.to };
  const signal = () => AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const client = getSupabase();

  const [summary, series, top] = await Promise.all([
    client.rpc('sales_summary', window).retry(false).abortSignal(signal()),
    client.rpc('sales_series', { ...window, p_bucket: range.bucket }).retry(false).abortSignal(signal()),
    client.rpc('top_products', { ...window, p_limit: TOP_PRODUCT_COUNT }).retry(false).abortSignal(signal()),
  ]);

  if (summary.error) throw new Error(`Could not load the sales summary: ${summary.error.message}`);
  if (series.error) throw new Error(`Could not load the sales chart: ${series.error.message}`);
  if (top.error) throw new Error(`Could not load the best sellers: ${top.error.message}`);

  return {
    summary: toSummary(summary.data),
    series: toSeries(series.data),
    topProducts: toTopProducts(top.data),
  };
}

import { formatRupiah } from '@/lib/money';
import { barHeight, bucketLabel, labelIndexes, type SeriesPoint } from './model';
import type { ReportBucket } from './range';

// Drawing units, not pixels: the SVG scales to its container width.
const WIDTH = 320;
const PLOT_TOP = 18;
const PLOT_HEIGHT = 120;
const LABEL_BASELINE = PLOT_TOP + PLOT_HEIGHT + 16;
const HEIGHT = LABEL_BASELINE + 4;
const MAX_BAR_WIDTH = 40;
const MAX_LABELS = 5;
const LABEL_HALF_WIDTH = 18;

type SalesChartProps = { points: readonly SeriesPoint[]; bucket: ReportBucket };

/**
 * Sales per hour or per day as plain SVG bars (no chart library). Every bucket of the window is
 * drawn, empty ones as zero-height bars, so gaps in sales are visible. One point is a single bar.
 */
export function SalesChart({ points, bucket }: SalesChartProps) {
  const maxRevenue = points.reduce((max, point) => Math.max(max, point.revenue), 0);
  const slot = WIDTH / Math.max(points.length, 1);
  const barWidth = Math.min(slot * 0.72, MAX_BAR_WIDTH);
  const unit = bucket === 'hour' ? 'jam' : 'hari';
  const description = `Grafik omzet per ${unit}, ${points.length} ${unit}, tertinggi ${formatRupiah(maxRevenue)}.`;

  return (
    <svg
      role="img"
      aria-label={description}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="block h-auto w-full max-w-md"
      data-testid="sales-chart"
    >
      {/* Top of the scale and the zero line. */}
      <text x={0} y={PLOT_TOP - 6} fontSize={10} className="fill-muted">
        {formatRupiah(maxRevenue)}
      </text>
      <line x1={0} x2={WIDTH} y1={PLOT_TOP} y2={PLOT_TOP} className="stroke-border" strokeWidth={1} strokeDasharray="3 3" />
      <line
        x1={0}
        x2={WIDTH}
        y1={PLOT_TOP + PLOT_HEIGHT}
        y2={PLOT_TOP + PLOT_HEIGHT}
        className="stroke-border-strong"
        strokeWidth={1}
      />

      {points.map((point, index) => {
        const height = barHeight(point.revenue, maxRevenue, PLOT_HEIGHT);
        return (
          <rect
            key={point.start}
            data-bar=""
            data-bucket={point.start}
            data-revenue={point.revenue}
            x={index * slot + (slot - barWidth) / 2}
            y={PLOT_TOP + PLOT_HEIGHT - height}
            width={barWidth}
            height={height}
            rx={Math.min(3, barWidth / 4)}
            className="fill-primary"
          >
            <title>{`${bucketLabel(point.start, bucket)}: ${formatRupiah(point.revenue)} (${point.transactionCount} transaksi)`}</title>
          </rect>
        );
      })}

      {labelIndexes(points.length, MAX_LABELS).map((index) => {
        const point = points[index];
        if (!point) return null;
        const center = index * slot + slot / 2;
        const x = Math.min(Math.max(center, LABEL_HALF_WIDTH), WIDTH - LABEL_HALF_WIDTH);
        return (
          <text key={point.start} x={x} y={LABEL_BASELINE} fontSize={10} textAnchor="middle" className="fill-muted">
            {bucketLabel(point.start, bucket)}
          </text>
        );
      })}
    </svg>
  );
}

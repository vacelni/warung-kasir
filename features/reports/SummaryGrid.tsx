import { Card } from '@/components/ui/Card';
import { formatRupiah } from '@/lib/money';
import type { SalesSummary } from './model';

type Metric = { label: string; value: string };

/** Exactly four metrics, a 2×2 grid on a phone (PRD §21, UI_SPEC A.16, decision C19). */
export function SummaryGrid({ summary }: { summary: SalesSummary }) {
  const metrics: Metric[] = [
    { label: 'Omzet', value: formatRupiah(summary.revenue) },
    { label: 'Transaksi', value: String(summary.transactionCount) },
    { label: 'Item Terjual', value: String(summary.itemCount) },
    { label: 'Rata-rata Transaksi', value: formatRupiah(summary.averageAmount) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {metrics.map((metric) => (
        <MetricCard key={metric.label} {...metric} />
      ))}
    </div>
  );
}

function MetricCard({ label, value }: Metric) {
  return (
    <Card role="group" aria-label={label} className="min-w-0 p-3">
      <p className="text-section-title font-bold text-foreground [overflow-wrap:anywhere]">{value}</p>
      <p className="mt-0.5 text-caption text-muted">{label}</p>
    </Card>
  );
}

'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { getInsight, type InsightResult } from './insight';
import type { ReportRange } from './range';

type State = { status: 'idle' } | { status: 'loading' } | { status: 'done'; result: InsightResult };

/**
 * "Ringkasan AI" on the owner dashboard (docs/AI_INSIGHT.md). Nothing is requested until the owner
 * asks: each request may use one of the day's AI calls. Give it `key={range.from + range.to}` so a
 * new period starts from the button again instead of showing the previous period's summary.
 */
export function AiInsightCard({ range }: { range: ReportRange }) {
  const [state, setState] = useState<State>({ status: 'idle' });

  async function ask() {
    setState({ status: 'loading' });
    setState({ status: 'done', result: await getInsight(range) });
  }

  return (
    <section aria-labelledby="ringkasan-ai" className="flex flex-col gap-3">
      <h2 id="ringkasan-ai" className="text-section-title font-semibold text-foreground">
        Ringkasan AI
      </h2>
      <Card>
        {state.status === 'idle' && (
          <div className="flex flex-col gap-3">
            <p className="text-body text-muted">Ringkasan singkat dan saran dari angka laporan periode ini.</p>
            <Button variant="secondary" onClick={ask} className="self-start">
              BUAT RINGKASAN
            </Button>
          </div>
        )}

        {state.status === 'loading' && (
          <div role="status" className="flex items-center gap-3 text-body text-muted">
            <Spinner />
            Membuat ringkasan…
          </div>
        )}

        {state.status === 'done' && !state.result.ok && (
          <div className="flex flex-col gap-3">
            <Alert tone="danger">{state.result.message}</Alert>
            <Button variant="secondary" onClick={ask} className="self-start">
              COBA LAGI
            </Button>
          </div>
        )}

        {state.status === 'done' && state.result.ok && <InsightBody result={state.result} />}
      </Card>
    </section>
  );
}

function InsightBody({ result }: { result: Extract<InsightResult, { ok: true }> }) {
  const { insight, engine, remaining, fallback } = result;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-base font-semibold text-foreground">{insight.headline}</p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-foreground">
        {insight.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <div>
        <h3 className="text-body font-semibold text-foreground">Saran</h3>
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-body text-foreground">
          {insight.suggestions.map((suggestion) => (
            <li key={suggestion}>{suggestion}</li>
          ))}
        </ul>
      </div>
      <p className="text-caption text-muted">
        {engine === 'ai'
          ? 'Dibuat oleh AI dari angka laporan ini. Periksa kembali sebelum mengambil keputusan.'
          : fallback
            ? 'AI sedang tidak tersedia, jadi ini ringkasan otomatis dari angka laporan.'
            : 'Ringkasan otomatis dari angka laporan.'}
        {remaining !== null ? ` Sisa ${remaining} ringkasan AI hari ini.` : ''}
      </p>
    </div>
  );
}

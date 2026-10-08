'use client';

import { useCallback, useEffect, useState } from 'react';
import { getReport } from './api';
import type { Report } from './model';
import { reportRangeFor, type ReportRange, type ReportSelection } from './range';

type Loaded = { key: string; range: ReportRange; report: Report | null };

function selectionKey(selection: ReportSelection): string {
  return selection.period === 'custom'
    ? `custom:${selection.fromDay}:${selection.toDay}`
    : selection.period;
}

/**
 * The dashboard data for a selection. `null` means "nothing valid to show yet" (an incomplete
 * custom range); pass a memoized selection. The range is computed when the request starts, so "Hari Ini" is the Jakarta
 * day at that moment; COBA LAGI recomputes it too. A failed request is `error`, never zeros.
 */
export function useReport(selection: ReportSelection | null) {
  const [reloadCount, setReloadCount] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = selection ? `${selectionKey(selection)}|${reloadCount}` : null;

  // Anything loaded for another selection counts as "still loading", so a filter change never
  // shows the previous period's numbers.
  const current = key !== null && loaded?.key === key ? loaded : null;

  useEffect(() => {
    if (!selection || key === null) return;
    let active = true;
    const range = reportRangeFor(selection, new Date());
    getReport(range).then(
      (report) => {
        if (active) setLoaded({ key, range, report });
      },
      (error: unknown) => {
        console.error('Could not load the sales report:', error);
        if (active) setLoaded({ key, range, report: null });
      },
    );
    return () => {
      active = false;
    };
  }, [selection, key]);

  const retry = useCallback(() => setReloadCount((count) => count + 1), []);

  if (key === null) return { status: 'idle' as const, report: null, range: null, retry };
  if (!current) return { status: 'loading' as const, report: null, range: null, retry };
  if (!current.report) return { status: 'error' as const, report: null, range: current.range, retry };
  return { status: 'ready' as const, report: current.report, range: current.range, retry };
}

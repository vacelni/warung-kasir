import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import type { ReportRange } from './range';

/**
 * The AI sales summary (docs/AI_INSIGHT.md). Off unless the build sets NEXT_PUBLIC_AI_INSIGHT=1,
 * so the production store does not get it by accident. The ai-insight Edge Function checks the
 * caller and enforces the daily limit; nothing here is a security control.
 */
export const AI_INSIGHT_ENABLED = process.env.NEXT_PUBLIC_AI_INSIGHT === '1';

export type Insight = { headline: string; points: string[]; suggestions: string[] };

export type InsightResult =
  | { ok: true; insight: Insight; engine: 'ai' | 'rules'; remaining: number | null; fallback: boolean }
  | { ok: false; message: string };

export const INSIGHT_MESSAGES = {
  offline: 'Tidak dapat terhubung ke server. Ringkasan membutuhkan koneksi internet.',
  unauthorized: 'Sesi Anda telah berakhir. Silakan masuk kembali.',
  forbidden: 'Ringkasan hanya tersedia untuk Owner.',
  quota: 'Batas ringkasan AI hari ini sudah habis. Coba lagi besok.',
  failed: 'Ringkasan gagal dibuat. Coba lagi.',
} as const;

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** The function's 200 body, checked before it reaches the screen. */
export function toInsightResult(body: unknown): InsightResult {
  if (typeof body !== 'object' || body === null) return { ok: false, message: INSIGHT_MESSAGES.failed };
  const { insight, engine, remaining, fallback } = body as Record<string, unknown>;
  if (
    typeof insight !== 'object' ||
    insight === null ||
    typeof (insight as Insight).headline !== 'string' ||
    !isStringList((insight as Insight).points) ||
    !isStringList((insight as Insight).suggestions) ||
    (engine !== 'ai' && engine !== 'rules')
  ) {
    return { ok: false, message: INSIGHT_MESSAGES.failed };
  }
  const { headline, points, suggestions } = insight as Insight;
  return {
    ok: true,
    insight: { headline, points, suggestions },
    engine,
    remaining: typeof remaining === 'number' ? remaining : null,
    fallback: fallback === 'ai_unavailable',
  };
}

/** Maps an ai-insight error code to a message for the owner. */
export function insightFailure(code: unknown): InsightResult {
  switch (code) {
    case 'unauthorized':
      return { ok: false, message: INSIGHT_MESSAGES.unauthorized };
    case 'forbidden':
    case 'origin_not_allowed':
      return { ok: false, message: INSIGHT_MESSAGES.forbidden };
    case 'quota':
      return { ok: false, message: INSIGHT_MESSAGES.quota };
    default:
      return { ok: false, message: INSIGHT_MESSAGES.failed };
  }
}

/** Asks the Edge Function to summarize the report window the dashboard is showing. */
export async function getInsight(range: ReportRange): Promise<InsightResult> {
  const { data, error } = await getSupabase().functions.invoke('ai-insight', {
    body: { from: range.from, to: range.to, bucket: range.bucket },
  });
  if (!error) return toInsightResult(data);

  if (error instanceof FunctionsFetchError) {
    console.error('ai-insight: request failed:', error.message);
    return { ok: false, message: INSIGHT_MESSAGES.offline };
  }
  if (error instanceof FunctionsHttpError) {
    const response: unknown = error.context;
    let body: unknown = null;
    if (response instanceof Response) {
      try {
        body = await response.json();
      } catch {
        // The gateway can answer with a non-JSON body (e.g. a rejected JWT); the fallback applies.
        body = null;
      }
    }
    const code = typeof body === 'object' && body !== null && 'error' in body ? body.error : null;
    console.error('ai-insight: refused:', code ?? error.message);
    return insightFailure(code);
  }
  console.error('ai-insight: failed:', error.message);
  return { ok: false, message: INSIGHT_MESSAGES.failed };
}

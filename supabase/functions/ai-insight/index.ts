/**
 * ai-insight Edge Function entry point (Deno). Wires handler.ts to Supabase and the Claude API.
 *
 * Supabase is called with the publishable key plus the caller's own access token, so RLS and the
 * owner guard in the report functions apply exactly as in the app. This function holds no secret
 * Supabase key. ANTHROPIC_API_KEY is optional: without it every insight is rule-based.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { createClient, type PostgrestError } from 'npm:@supabase/supabase-js@2.117.3';
import { parseAllowedOrigins } from '../_shared/cors.ts';
import {
  ForbiddenError,
  handleRequest,
  InvalidWindowError,
  UnauthorizedError,
  type InsightModel,
  type ReportWindow,
  type StoreReports,
} from './handler.ts';
import { INSIGHT_SCHEMA, type SalesFacts, type Summary } from './insight.ts';

/** One short, single-step summary per call; low effort keeps it quick and cheap. */
const MODEL = 'claude-opus-5-5';
const TOP_PRODUCTS = 10;

/** The new-style publishable key (SUPABASE_PUBLISHABLE_KEYS), falling back to the legacy anon key. */
function publishableKey(): string {
  const keys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (keys) {
    const parsed: unknown = JSON.parse(keys);
    if (typeof parsed === 'object' && parsed !== null && 'default' in parsed && typeof parsed.default === 'string') {
      return parsed.default;
    }
  }
  const legacy = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacy) return legacy;
  throw new Error('No publishable key is configured for ai-insight.');
}

const url = Deno.env.get('SUPABASE_URL');
if (!url) throw new Error('SUPABASE_URL is not set.');
const apiKey = publishableKey();

/** PostgREST errors become the handler's typed errors; anything else is an outage. */
function raise(step: string, error: PostgrestError, status: number): never {
  if (status === 401 || error.code === 'PGRST301' || error.code === 'PGRST303') throw new UnauthorizedError(step);
  if (error.code === '42501') throw new ForbiddenError(step);
  if (error.code === '22023') throw new InvalidWindowError(step);
  throw new Error(`${step} failed: ${error.code} ${error.message}`);
}

type SummaryRow = { revenue: number; transaction_count: number; item_count: number; average_amount: number };

function toSummary(rows: SummaryRow[] | null): Summary {
  const row = rows?.[0];
  if (!row) throw new Error('sales_summary returned no row');
  return {
    revenue: row.revenue,
    transactionCount: row.transaction_count,
    itemCount: row.item_count,
    averageAmount: row.average_amount,
  };
}

function reportsFor(token: string): StoreReports {
  const supabase = createClient(url!, apiKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  return {
    async load(window: ReportWindow): Promise<SalesFacts> {
      const length = Date.parse(window.to) - Date.parse(window.from);
      const previousFrom = new Date(Date.parse(window.from) - length).toISOString();
      const [summary, previous, series, top] = await Promise.all([
        supabase.rpc('sales_summary', { p_from: window.from, p_to: window.to }),
        supabase.rpc('sales_summary', { p_from: previousFrom, p_to: window.from }),
        supabase.rpc('sales_series', { p_from: window.from, p_to: window.to, p_bucket: window.bucket }),
        supabase.rpc('top_products', { p_from: window.from, p_to: window.to, p_limit: TOP_PRODUCTS }),
      ]);
      if (summary.error) raise('sales_summary', summary.error, summary.status);
      if (previous.error) raise('previous sales_summary', previous.error, previous.status);
      if (series.error) raise('sales_series', series.error, series.status);
      if (top.error) raise('top_products', top.error, top.status);

      return {
        from: window.from,
        to: window.to,
        bucket: window.bucket,
        summary: toSummary(summary.data as SummaryRow[]),
        previous: toSummary(previous.data as SummaryRow[]),
        series: (series.data as { bucket_start: string; revenue: number; transaction_count: number }[]).map((row) => ({
          start: row.bucket_start,
          revenue: row.revenue,
          transactionCount: row.transaction_count,
        })),
        topProducts: (top.data as { product_name: string; quantity: number; revenue: number }[]).map((row) => ({
          productName: row.product_name,
          quantity: row.quantity,
          revenue: row.revenue,
        })),
      };
    },

    async consumeQuota() {
      const { data, error, status } = await supabase.rpc('consume_ai_insight');
      if (error) {
        if (error.code === 'P0001' && error.hint === 'quota') return { ok: false };
        raise('consume_ai_insight', error, status);
      }
      return { ok: true, remaining: data as number };
    },
  };
}

const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
const anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey, maxRetries: 1, timeout: 45_000 }) : null;

const model: InsightModel | null = anthropic
  ? async (system, prompt) => {
      const response = await anthropic.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        // If a safety classifier declines, the API re-runs the request on its recommended fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: INSIGHT_SCHEMA } },
        system,
        messages: [{ role: 'user', content: prompt }],
      });
      if (response.stop_reason === 'refusal') throw new Error('The model declined the request.');
      if (response.stop_reason === 'max_tokens') throw new Error('The model answer was cut off.');
      return response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
    }
  : null;

const allowedOrigins = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'));

Deno.serve((request) => handleRequest(request, { allowedOrigins, reportsFor, model }));

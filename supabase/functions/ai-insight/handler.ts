/**
 * ai-insight: a short written summary of the owner's sales report (docs/AI_INSIGHT.md).
 *
 * This module holds the request logic and has no Deno globals or network code: `index.ts` wires it
 * to Supabase (as the caller, never with a secret key) and to the Claude API, and Vitest drives it
 * with in-memory fakes.
 *
 * Authority comes from the database, not from this function: the report functions and the quota
 * function run with the caller's own access token and refuse anyone but the active owner of the
 * store (private.require_owner_store). The body only says which window to summarize.
 */
import { readBodyLimited } from '../_shared/body.ts';
import { corsHeaders, isOriginAllowed } from '../_shared/cors.ts';
import { buildPrompt, parseInsight, rulesInsight, SYSTEM_PROMPT, type Bucket, type Insight, type SalesFacts } from './insight.ts';

/** The caller's token was refused (expired, revoked, or not a session). */
export class UnauthorizedError extends Error {}
/** The caller is signed in but is not the store's active owner. */
export class ForbiddenError extends Error {}
/** The database refused the window (too long, or not a range). */
export class InvalidWindowError extends Error {}

export type ReportWindow = { from: string; to: string; bucket: Bucket };

/** The caller's view of the store, through their own token. Throws the errors above. */
export interface StoreReports {
  load(window: ReportWindow): Promise<SalesFacts>;
  /** Reserves one model call; false when today's calls are used up. */
  consumeQuota(): Promise<{ ok: true; remaining: number } | { ok: false }>;
}

/** Returns the model's answer as JSON text, or throws. */
export type InsightModel = (system: string, prompt: string) => Promise<string>;

export type HandlerDeps = {
  allowedOrigins: ReadonlySet<string>;
  reportsFor(token: string): StoreReports;
  /** null when no API key is configured: every insight is then rule-based. */
  model: InsightModel | null;
};

export type ErrorCode = 'origin_not_allowed' | 'method_not_allowed' | 'unauthorized' | 'forbidden' | 'invalid_request' | 'quota' | 'server_error';

export type InsightResponse = {
  insight: Insight;
  engine: 'ai' | 'rules';
  /** Model calls left today; null when no model call was made. */
  remaining: number | null;
  /** Set when a model was configured but the answer came from the rules instead. */
  fallback?: 'ai_unavailable';
};

const STATUS: Record<ErrorCode, number> = {
  origin_not_allowed: 403,
  method_not_allowed: 405,
  unauthorized: 401,
  forbidden: 403,
  invalid_request: 400,
  quota: 429,
  server_error: 500,
};

const MAX_BODY_BYTES = 1024;
const MAX_WINDOW_MS = 366 * 24 * 60 * 60 * 1000;

function bearerToken(header: string | null): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return match?.[1] ?? null;
}

/** { from, to, bucket } with ISO instants, from before to, at most 366 days; null otherwise. */
export function parseWindow(text: string): ReportWindow | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) return null;
  const { from, to, bucket } = body as Record<string, unknown>;
  if (typeof from !== 'string' || typeof to !== 'string') return null;
  if (bucket !== 'hour' && bucket !== 'day') return null;
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start || end - start > MAX_WINDOW_MS) return null;
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString(), bucket };
}

export async function handleRequest(request: Request, deps: HandlerDeps): Promise<Response> {
  const origin = request.headers.get('Origin');
  const cors = corsHeaders(origin, deps.allowedOrigins);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  const fail = (error: ErrorCode) => json(STATUS[error], { error });

  if (!isOriginAllowed(origin, deps.allowedOrigins)) return fail('origin_not_allowed');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return fail('method_not_allowed');

  const token = bearerToken(request.headers.get('Authorization'));
  if (!token) return fail('unauthorized');

  const text = await readBodyLimited(request, MAX_BODY_BYTES);
  const window = text === null ? null : parseWindow(text);
  if (!window) return fail('invalid_request');

  const reports = deps.reportsFor(token);
  try {
    // The owner check happens here, in the database, before any quota or model use.
    const facts = await reports.load(window);
    const reply = (body: InsightResponse) => json(200, body);

    // Nothing sold, or no model configured: the rules answer, and no quota is spent.
    if (facts.summary.transactionCount === 0 || !deps.model) {
      return reply({ insight: rulesInsight(facts), engine: 'rules', remaining: null });
    }

    const quota = await reports.consumeQuota();
    if (!quota.ok) return fail('quota');

    const insight = await askModel(deps.model, facts);
    if (!insight) {
      return reply({ insight: rulesInsight(facts), engine: 'rules', remaining: quota.remaining, fallback: 'ai_unavailable' });
    }
    return reply({ insight, engine: 'ai', remaining: quota.remaining });
  } catch (error) {
    if (error instanceof UnauthorizedError) return fail('unauthorized');
    if (error instanceof ForbiddenError) return fail('forbidden');
    if (error instanceof InvalidWindowError) return fail('invalid_request');
    console.error('ai-insight: unexpected failure:', error instanceof Error ? error.message : 'unknown error');
    return fail('server_error');
  }
}

/** The model's insight, or null when the call fails or the answer has the wrong shape. */
async function askModel(model: InsightModel, facts: SalesFacts): Promise<Insight | null> {
  try {
    const text = await model(SYSTEM_PROMPT, buildPrompt(facts));
    const insight = parseInsight(text);
    if (!insight) console.error('ai-insight: the model answer did not match the schema');
    return insight;
  } catch (error) {
    // Only the message: the prompt holds the store's sales figures.
    console.error('ai-insight: model call failed:', error instanceof Error ? error.message : 'unknown error');
    return null;
  }
}

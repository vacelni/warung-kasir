import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAllowedOrigins } from '../_shared/cors.ts';
import {
  ForbiddenError,
  handleRequest,
  InvalidWindowError,
  parseWindow,
  UnauthorizedError,
  type HandlerDeps,
  type InsightModel,
  type StoreReports,
} from './handler.ts';
import { SYSTEM_PROMPT, type SalesFacts } from './insight.ts';

// In-memory stand-ins: the real StoreReports is index.ts calling the report RPCs with the caller's
// token; pgTAP (supabase/tests/08_ai_insight.test.sql) covers the owner guard and the quota.

const APP = 'https://kasir.example.com';
const WINDOW = { from: '2026-03-09T17:00:00.000Z', to: '2026-03-10T17:00:00.000Z', bucket: 'hour' };
const AI_ANSWER = { headline: 'Omzet naik 25%.', points: ['Ramai jam 12.00.', 'Nasi Goreng terlaris.'], suggestions: ['Siapkan bahan lebih awal.'] };

function facts(transactionCount = 25): SalesFacts {
  return {
    ...WINDOW,
    bucket: 'hour',
    summary: { revenue: transactionCount * 16000, transactionCount, itemCount: transactionCount * 2, averageAmount: transactionCount ? 16000 : 0 },
    previous: { revenue: 320000, transactionCount: 20, itemCount: 40, averageAmount: 16000 },
    series: [],
    topProducts: transactionCount ? [{ productName: 'Nasi Goreng', quantity: 18, revenue: 270000 }] : [],
  };
}

function setup(options: { model?: InsightModel | null; load?: () => Promise<SalesFacts>; quotaLeft?: number } = {}) {
  let quotaLeft = options.quotaLeft ?? 20;
  const tokens: string[] = [];
  const reports: StoreReports = {
    load: vi.fn(options.load ?? (async () => facts())),
    consumeQuota: vi.fn(async () => (quotaLeft > 0 ? { ok: true as const, remaining: --quotaLeft } : { ok: false as const })),
  };
  const model = options.model === undefined ? vi.fn<InsightModel>(async () => JSON.stringify(AI_ANSWER)) : options.model;
  const deps: HandlerDeps = {
    allowedOrigins: parseAllowedOrigins(APP),
    reportsFor: (token) => {
      tokens.push(token);
      return reports;
    },
    model,
  };
  return { deps, reports, model, tokens };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/functions/v1/ai-insight', {
    method: 'POST',
    headers: { Origin: APP, Authorization: 'Bearer owner-token', 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseWindow', () => {
  it('accepts a window and normalizes the instants', () => {
    expect(parseWindow(JSON.stringify({ from: '2026-03-10T00:00:00+07:00', to: '2026-03-11T00:00:00+07:00', bucket: 'hour' }))).toEqual(WINDOW);
  });

  it('rejects anything that is not a bounded window', () => {
    for (const body of [
      'nope',
      '[]',
      JSON.stringify({ ...WINDOW, bucket: 'week' }),
      JSON.stringify({ ...WINDOW, to: WINDOW.from }),
      JSON.stringify({ ...WINDOW, from: 'yesterday' }),
      JSON.stringify({ from: '2025-01-01T00:00:00Z', to: '2026-03-01T00:00:00Z', bucket: 'day' }),
    ]) {
      expect(parseWindow(body), body).toBeNull();
    }
  });
});

describe('handleRequest: gates', () => {
  it('refuses other origins, other methods, and calls without a token', async () => {
    const { deps, reports } = setup();
    expect((await handleRequest(post(WINDOW, { Origin: 'https://evil.example' }), deps)).status).toBe(403);
    expect((await handleRequest(new Request('http://localhost', { method: 'GET', headers: { Origin: APP } }), deps)).status).toBe(405);
    const noToken = await handleRequest(post(WINDOW, { Authorization: '' }), deps);
    expect(noToken.status).toBe(401);
    expect(await noToken.json()).toEqual({ error: 'unauthorized' });
    expect(reports.load).not.toHaveBeenCalled();
  });

  it('answers the CORS preflight for the app', async () => {
    const response = await handleRequest(new Request('http://localhost', { method: 'OPTIONS', headers: { Origin: APP } }), setup().deps);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(APP);
  });

  it('rejects an invalid or oversized body before touching the database', async () => {
    const { deps, reports } = setup();
    expect((await handleRequest(post({ from: 'x' }), deps)).status).toBe(400);
    expect((await handleRequest(post({ ...WINDOW, pad: 'x'.repeat(2000) }), deps)).status).toBe(400);
    expect(reports.load).not.toHaveBeenCalled();
  });

  it('reads the report with the caller’s own token', async () => {
    const { deps, tokens } = setup();
    await handleRequest(post(WINDOW), deps);
    expect(tokens).toEqual(['owner-token']);
  });

  it.each([
    [new UnauthorizedError('x'), 401, 'unauthorized'],
    [new ForbiddenError('x'), 403, 'forbidden'],
    [new InvalidWindowError('x'), 400, 'invalid_request'],
    [new Error('database down'), 500, 'server_error'],
  ])('maps a refused report (%s) without spending quota or calling the model', async (error, status, code) => {
    const { deps, reports, model } = setup({ load: async () => Promise.reject(error) });
    const response = await handleRequest(post(WINDOW), deps);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: code });
    expect(reports.consumeQuota).not.toHaveBeenCalled();
    expect(model).not.toHaveBeenCalled();
  });
});

describe('handleRequest: insight', () => {
  it('returns the model’s insight and the calls left today', async () => {
    const { deps, model } = setup();
    const response = await handleRequest(post(WINDOW), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ insight: AI_ANSWER, engine: 'ai', remaining: 19 });
    expect(model).toHaveBeenCalledWith(SYSTEM_PROMPT, expect.stringContaining('<data>'));
  });

  it('uses the rules, and spends no quota, when no model is configured', async () => {
    const { deps, reports } = setup({ model: null });
    const body = await (await handleRequest(post(WINDOW), deps)).json();
    expect(body.engine).toBe('rules');
    expect(body.remaining).toBeNull();
    expect(body.insight.headline).toContain('Rp400.000');
    expect(reports.consumeQuota).not.toHaveBeenCalled();
  });

  it('does not call the model for a period with no sales', async () => {
    const { deps, reports, model } = setup({ load: async () => facts(0) });
    const body = await (await handleRequest(post(WINDOW), deps)).json();
    expect(body).toMatchObject({ engine: 'rules', insight: { headline: 'Belum ada penjualan pada periode ini.' } });
    expect(model).not.toHaveBeenCalled();
    expect(reports.consumeQuota).not.toHaveBeenCalled();
  });

  it('refuses with 429 once today’s calls are used up, without calling the model', async () => {
    const { deps, model } = setup({ quotaLeft: 0 });
    const response = await handleRequest(post(WINDOW), deps);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'quota' });
    expect(model).not.toHaveBeenCalled();
  });

  it.each([
    ['the model call fails', vi.fn<InsightModel>(async () => Promise.reject(new Error('overloaded')))],
    ['the answer has the wrong shape', vi.fn<InsightModel>(async () => JSON.stringify({ headline: 'x' }))],
  ])('falls back to the rules when %s', async (_case, model) => {
    const { deps } = setup({ model });
    const response = await handleRequest(post(WINDOW), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ engine: 'rules', fallback: 'ai_unavailable', remaining: 19 });
  });
});

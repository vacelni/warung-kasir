import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getInsight, INSIGHT_MESSAGES, insightFailure, toInsightResult } from './insight';
import type { ReportRange } from './range';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ functions: { invoke: mocks.invoke } }) }));

const RANGE: ReportRange = {
  from: '2026-10-07T17:00:00.000Z',
  to: '2026-10-08T17:00:00.000Z',
  bucket: 'hour',
  days: 1,
};
const INSIGHT = { headline: 'Omzet naik.', points: ['Ramai jam 12.00.'], suggestions: ['Siapkan bahan.'] };

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  mocks.invoke.mockReset();
});

describe('toInsightResult', () => {
  it('accepts the function’s answer', () => {
    expect(toInsightResult({ insight: INSIGHT, engine: 'ai', remaining: 19 })).toEqual({
      ok: true,
      insight: INSIGHT,
      engine: 'ai',
      remaining: 19,
      fallback: false,
    });
    expect(toInsightResult({ insight: INSIGHT, engine: 'rules', remaining: null, fallback: 'ai_unavailable' })).toMatchObject({
      engine: 'rules',
      remaining: null,
      fallback: true,
    });
  });

  it('treats a malformed answer as a failure', () => {
    for (const body of [null, 'x', { insight: INSIGHT, engine: 'gpt' }, { insight: { ...INSIGHT, points: 'a' }, engine: 'ai' }]) {
      expect(toInsightResult(body)).toEqual({ ok: false, message: INSIGHT_MESSAGES.failed });
    }
  });
});

describe('insightFailure', () => {
  it('gives the owner a message for each error code', () => {
    expect(insightFailure('quota')).toEqual({ ok: false, message: INSIGHT_MESSAGES.quota });
    expect(insightFailure('forbidden')).toEqual({ ok: false, message: INSIGHT_MESSAGES.forbidden });
    expect(insightFailure('unauthorized')).toEqual({ ok: false, message: INSIGHT_MESSAGES.unauthorized });
    expect(insightFailure('server_error')).toEqual({ ok: false, message: INSIGHT_MESSAGES.failed });
  });
});

describe('getInsight', () => {
  it('sends the dashboard’s window and nothing else', async () => {
    mocks.invoke.mockResolvedValue({ data: { insight: INSIGHT, engine: 'ai', remaining: 3 }, error: null });
    await expect(getInsight(RANGE)).resolves.toMatchObject({ ok: true, remaining: 3 });
    expect(mocks.invoke).toHaveBeenCalledWith('ai-insight', { body: { from: RANGE.from, to: RANGE.to, bucket: 'hour' } });
  });

  it('reads the error code from a refused call', async () => {
    const response = new Response(JSON.stringify({ error: 'quota' }), { status: 429 });
    mocks.invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(response) });
    await expect(getInsight(RANGE)).resolves.toEqual({ ok: false, message: INSIGHT_MESSAGES.quota });
  });

  it('says so when the device is offline', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new FunctionsFetchError(new TypeError('Failed to fetch')) });
    await expect(getInsight(RANGE)).resolves.toEqual({ ok: false, message: INSIGHT_MESSAGES.offline });
  });
});

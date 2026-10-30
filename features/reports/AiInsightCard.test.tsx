// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiInsightCard } from './AiInsightCard';
import type { InsightResult } from './insight';
import type { ReportRange } from './range';

const mocks = vi.hoisted(() => ({ getInsight: vi.fn() }));
vi.mock('./insight', () => ({ getInsight: mocks.getInsight }));

const RANGE: ReportRange = { from: '2026-10-07T17:00:00.000Z', to: '2026-10-08T17:00:00.000Z', bucket: 'hour', days: 1 };
const POINT = 'Paling ramai jam 12.00.';
const SUGGESTION = 'Siapkan bahan sebelum jam 12.00.';
const INSIGHT = { headline: 'Omzet Rp400.000, naik 25%.', points: [POINT], suggestions: [SUGGESTION] };

afterEach(() => {
  cleanup();
  mocks.getInsight.mockReset();
});

function result(overrides: Partial<Extract<InsightResult, { ok: true }>> = {}): InsightResult {
  return { ok: true, insight: INSIGHT, engine: 'ai', remaining: 19, fallback: false, ...overrides };
}

describe('AiInsightCard', () => {
  it('asks only when the owner presses the button', async () => {
    mocks.getInsight.mockResolvedValue(result());
    render(<AiInsightCard range={RANGE} />);
    expect(mocks.getInsight).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'BUAT RINGKASAN' }));
    expect(await screen.findByText(INSIGHT.headline)).toBeTruthy();
    expect(mocks.getInsight).toHaveBeenCalledWith(RANGE);
    expect(screen.getByText(POINT)).toBeTruthy();
    expect(screen.getByText(SUGGESTION)).toBeTruthy();
    expect(screen.getByText(/Dibuat oleh AI dari angka laporan ini\..*Sisa 19 ringkasan AI hari ini\./)).toBeTruthy();
  });

  it('labels a rule-based summary, and a fallback, honestly', async () => {
    mocks.getInsight.mockResolvedValueOnce(result({ engine: 'rules', remaining: null }));
    render(<AiInsightCard range={RANGE} />);
    fireEvent.click(screen.getByRole('button', { name: 'BUAT RINGKASAN' }));
    expect(await screen.findByText('Ringkasan otomatis dari angka laporan.')).toBeTruthy();

    cleanup();
    mocks.getInsight.mockResolvedValueOnce(result({ engine: 'rules', fallback: true, remaining: 18 }));
    render(<AiInsightCard range={RANGE} />);
    fireEvent.click(screen.getByRole('button', { name: 'BUAT RINGKASAN' }));
    expect(await screen.findByText(/AI sedang tidak tersedia/)).toBeTruthy();
  });

  it('shows the error and lets the owner try again', async () => {
    mocks.getInsight.mockResolvedValueOnce({ ok: false, message: 'Batas ringkasan AI hari ini sudah habis. Coba lagi besok.' });
    mocks.getInsight.mockResolvedValueOnce(result());
    render(<AiInsightCard range={RANGE} />);
    fireEvent.click(screen.getByRole('button', { name: 'BUAT RINGKASAN' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Batas ringkasan AI');

    fireEvent.click(screen.getByRole('button', { name: 'COBA LAGI' }));
    expect(await screen.findByText(INSIGHT.headline)).toBeTruthy();
  });
});

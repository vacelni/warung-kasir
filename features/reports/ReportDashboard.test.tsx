// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Report } from './model';
import type { ReportRange } from './range';
import { ReportDashboard } from './ReportDashboard';

const mocks = vi.hoisted(() => ({ getReport: vi.fn() }));
vi.mock('./api', () => ({ getReport: mocks.getReport }));

const REPORT: Report = {
  summary: { revenue: 80000, transactionCount: 3, itemCount: 9, averageAmount: 26667 },
  series: [
    { start: '2026-08-09T17:00:00+00:00', revenue: 65000, transactionCount: 2 },
    { start: '2026-08-10T17:00:00+00:00', revenue: 15000, transactionCount: 1 },
    { start: '2026-08-11T17:00:00+00:00', revenue: 0, transactionCount: 0 },
  ],
  topProducts: [
    { productId: 'p1', productName: 'Es Teh', quantity: 5, revenue: 25000 },
    { productId: 'p2', productName: 'Nasi Goreng', quantity: 2, revenue: 30000 },
  ],
};

const EMPTY: Report = {
  summary: { revenue: 0, transactionCount: 0, itemCount: 0, averageAmount: 0 },
  series: [{ start: '2026-08-09T17:00:00+00:00', revenue: 0, transactionCount: 0 }],
  topProducts: [],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00+07:00'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  mocks.getReport.mockReset();
});

const metric = (name: string) => within(screen.getByRole('group', { name }));

describe('ReportDashboard', () => {
  it('shows a loading state, then exactly four metrics, the chart, and the best sellers', async () => {
    mocks.getReport.mockResolvedValue(REPORT);
    render(<ReportDashboard />);

    expect(screen.getByRole('status', { name: 'Memuat laporan' })).toBeTruthy();
    await screen.findByRole('group', { name: 'Omzet' });

    expect(metric('Omzet').getByText('Rp80.000')).toBeTruthy();
    expect(metric('Transaksi').getByText('3')).toBeTruthy();
    expect(metric('Item Terjual').getByText('9')).toBeTruthy();
    expect(metric('Rata-rata Transaksi').getByText('Rp26.667')).toBeTruthy();
    // Four metric cards and no others.
    expect(screen.getAllByRole('group').filter((g) => g.getAttribute('aria-label') !== 'Periode laporan')).toHaveLength(4);

    const chart = screen.getByTestId('sales-chart');
    expect(chart.tagName.toLowerCase()).toBe('svg');
    expect(chart.querySelectorAll('rect[data-bar]')).toHaveLength(3);

    const best = screen.getByRole('heading', { name: 'Menu Terlaris' }).closest('section')!;
    expect(within(best).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '1Es TehRp25.0005 terjual',
      '2Nasi GorengRp30.0002 terjual',
    ]);
  });

  it('starts on Hari Ini with the Jakarta day (17:00Z the day before to 17:00Z) grouped by hour', async () => {
    mocks.getReport.mockResolvedValue(REPORT);
    render(<ReportDashboard />);
    await screen.findByRole('group', { name: 'Omzet' });

    const range = mocks.getReport.mock.calls[0]?.[0] as ReportRange;
    expect(range).toEqual({
      from: '2026-10-07T17:00:00.000Z',
      to: '2026-10-08T17:00:00.000Z',
      bucket: 'hour',
      days: 1,
    });
    expect(screen.getByRole('button', { name: 'Hari Ini' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Kamis, 8 Okt 2026')).toBeTruthy();
  });

  it('changing the filter asks for the new window and never shows the previous period numbers meanwhile', async () => {
    mocks.getReport.mockResolvedValueOnce(REPORT);
    render(<ReportDashboard />);
    await screen.findByRole('group', { name: 'Omzet' });

    let finish: (report: Report) => void = () => {};
    mocks.getReport.mockReturnValueOnce(new Promise<Report>((resolve) => (finish = resolve)));
    fireEvent.click(screen.getByRole('button', { name: '7 Hari' }));

    expect(screen.queryByRole('group', { name: 'Omzet' })).toBeNull();
    expect(screen.getByRole('status', { name: 'Memuat laporan' })).toBeTruthy();
    expect(mocks.getReport.mock.calls[1]?.[0]).toMatchObject({
      from: '2026-10-01T17:00:00.000Z',
      to: '2026-10-08T17:00:00.000Z',
      bucket: 'day',
    });

    finish(EMPTY);
    await screen.findByRole('group', { name: 'Omzet' });
    expect(metric('Omzet').getByText('Rp0')).toBeTruthy();
  });

  it('shows zeros and empty states when nothing was sold', async () => {
    mocks.getReport.mockResolvedValue(EMPTY);
    render(<ReportDashboard />);
    await screen.findByRole('group', { name: 'Omzet' });

    expect(metric('Omzet').getByText('Rp0')).toBeTruthy();
    expect(metric('Transaksi').getByText('0')).toBeTruthy();
    expect(metric('Item Terjual').getByText('0')).toBeTruthy();
    expect(metric('Rata-rata Transaksi').getByText('Rp0')).toBeTruthy();
    expect(screen.getByText('Belum ada penjualan hari ini.')).toBeTruthy();
    expect(screen.queryByTestId('sales-chart')).toBeNull();
    expect(screen.getByText('Belum ada menu terjual')).toBeTruthy();
  });

  it('draws a single bar when the window has one point', async () => {
    mocks.getReport.mockResolvedValue({
      ...REPORT,
      series: [{ start: '2026-08-09T17:00:00+00:00', revenue: 80000, transactionCount: 3 }],
    });
    render(<ReportDashboard />);
    await screen.findByTestId('sales-chart');
    expect(screen.getByTestId('sales-chart').querySelectorAll('rect[data-bar]')).toHaveLength(1);
  });

  it('shows an error with COBA LAGI, never zeros, when the request fails', async () => {
    mocks.getReport.mockRejectedValueOnce(new Error('network down'));
    render(<ReportDashboard />);

    expect(await screen.findByText('Laporan gagal dimuat')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Omzet' })).toBeNull();

    mocks.getReport.mockResolvedValueOnce(REPORT);
    fireEvent.click(screen.getByRole('button', { name: 'COBA LAGI' }));
    expect(await screen.findByRole('group', { name: 'Omzet' })).toBeTruthy();
    expect(mocks.getReport).toHaveBeenCalledTimes(2);
  });

  describe('Custom range', () => {
    it('asks for the chosen Jakarta days, end day included', async () => {
      mocks.getReport.mockResolvedValue(REPORT);
      render(<ReportDashboard />);
      await screen.findByRole('group', { name: 'Omzet' });

      fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
      fireEvent.change(screen.getByLabelText('Dari tanggal'), { target: { value: '2026-08-10' } });
      fireEvent.change(screen.getByLabelText('Sampai tanggal'), { target: { value: '2026-08-11' } });

      await waitFor(() =>
        expect(mocks.getReport).toHaveBeenLastCalledWith({
          from: '2026-08-09T17:00:00.000Z',
          to: '2026-08-11T17:00:00.000Z',
          bucket: 'day',
          days: 2,
        }),
      );
    });

    it('explains a reversed range and sends no request for it', async () => {
      mocks.getReport.mockResolvedValue(REPORT);
      render(<ReportDashboard />);
      await screen.findByRole('group', { name: 'Omzet' });
      fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
      await screen.findByRole('group', { name: 'Omzet' });
      const calls = mocks.getReport.mock.calls.length;

      // "Dari tanggal" starts at 2 Oct, so an end date of 10 Aug is before the start.
      fireEvent.change(screen.getByLabelText('Sampai tanggal'), { target: { value: '2026-08-10' } });

      expect(screen.getByRole('alert').textContent).toMatch(/Tanggal awal tidak boleh setelah tanggal akhir/);
      expect(screen.queryByRole('group', { name: 'Omzet' })).toBeNull();
      expect(mocks.getReport.mock.calls.length).toBe(calls);
    });

    it('treats a cleared date as incomplete, not as an error response', async () => {
      mocks.getReport.mockResolvedValue(REPORT);
      render(<ReportDashboard />);
      await screen.findByRole('group', { name: 'Omzet' });
      fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
      fireEvent.change(screen.getByLabelText('Dari tanggal'), { target: { value: '' } });

      expect(screen.getByRole('alert').textContent).toMatch(/Isi tanggal/);
      expect(screen.queryByText('Laporan gagal dimuat')).toBeNull();
    });
  });
});

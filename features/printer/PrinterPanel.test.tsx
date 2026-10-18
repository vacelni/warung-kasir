// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrinterPanel } from './PrinterPanel';
import { PRINTER_SETTINGS_KEY, readPrinterSettings } from './printerSettings';

const mocks = vi.hoisted(() => ({ requestDevice: vi.fn() }));

function setBluetooth(api: unknown) {
  Object.defineProperty(globalThis.navigator, 'bluetooth', { value: api, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
  mocks.requestDevice.mockReset();
  setBluetooth({ requestDevice: mocks.requestDevice });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(globalThis.navigator, 'bluetooth');
  vi.restoreAllMocks();
});

describe('PrinterPanel (Lainnya)', () => {
  it('starts without a printer, on 58 mm paper', () => {
    render(<PrinterPanel />);

    expect(screen.getByText('Belum dipasang')).toBeTruthy();
    expect(screen.getByRole('button', { name: '58 mm' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '80 mm' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('button', { name: 'CETAK TES' })).toBeNull();
  });

  it('remembers the chosen printer on this device', async () => {
    mocks.requestDevice.mockResolvedValue({ id: 'p1', name: 'MHT-P29L' });
    render(<PrinterPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'HUBUNGKAN PRINTER' }));

    await waitFor(() => expect(screen.getByText('Terpasang')).toBeTruthy());
    expect(screen.getByText('MHT-P29L')).toBeTruthy();
    expect(readPrinterSettings()).toMatchObject({ deviceId: 'p1', deviceName: 'MHT-P29L' });
    expect(screen.getByRole('button', { name: 'CETAK TES' })).toBeTruthy();
  });

  it('keeps the paper width across visits', () => {
    const { unmount } = render(<PrinterPanel />);
    fireEvent.click(screen.getByRole('button', { name: '80 mm' }));
    expect(readPrinterSettings().paper).toBe(80);
    unmount();

    render(<PrinterPanel />);
    expect(screen.getByRole('button', { name: '80 mm' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('forgets the printer but keeps the paper width', () => {
    localStorage.setItem(PRINTER_SETTINGS_KEY, JSON.stringify({ paper: 80, deviceId: 'p1', deviceName: 'MHT-P29L' }));
    render(<PrinterPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'LUPAKAN PRINTER' }));

    expect(screen.getByText('Belum dipasang')).toBeTruthy();
    expect(readPrinterSettings()).toEqual({ paper: 80, deviceId: null, deviceName: null });
  });

  it('explains when the browser cannot use Bluetooth printers', () => {
    Reflect.deleteProperty(globalThis.navigator, 'bluetooth');
    render(<PrinterPanel />);

    expect(screen.getByText(/tidak mendukung cetak Bluetooth/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'HUBUNGKAN PRINTER' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('survives corrupted saved settings', () => {
    localStorage.setItem(PRINTER_SETTINGS_KEY, '{not json');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<PrinterPanel />);

    expect(screen.getByText('Belum dipasang')).toBeTruthy();
  });
});

import type { PaperWidth } from './escpos';

/**
 * Printer choices belong to this device (the printer is paired to this phone), so they live in the
 * browser's localStorage, not in the database. They hold no credential or business data. Storage can
 * be blocked or empty; the defaults then apply and nothing breaks.
 */
export type PrinterSettings = {
  paper: PaperWidth;
  /** Browser id of the paired printer, null when none is remembered. */
  deviceId: string | null;
  deviceName: string | null;
};

export const PRINTER_SETTINGS_KEY = 'wk-printer';

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = { paper: 58, deviceId: null, deviceName: null };

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

export function readPrinterSettings(): PrinterSettings {
  try {
    const raw = localStorage.getItem(PRINTER_SETTINGS_KEY);
    if (!raw) return DEFAULT_PRINTER_SETTINGS;
    const data = JSON.parse(raw) as Record<string, unknown>;
    return {
      paper: data.paper === 80 ? 80 : 58,
      deviceId: text(data.deviceId),
      deviceName: text(data.deviceName),
    };
  } catch (error) {
    console.warn('Could not read the printer settings; using the defaults:', error);
    return DEFAULT_PRINTER_SETTINGS;
  }
}

export function savePrinterSettings(settings: PrinterSettings): void {
  try {
    localStorage.setItem(PRINTER_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Could not save the printer settings on this device:', error);
  }
}

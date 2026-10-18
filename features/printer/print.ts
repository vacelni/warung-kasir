import { ensurePrinter, pairPrinter, releasePrinter, sendToPrinter } from './bluetooth';
import { buildReceiptBytes, buildTestBytes, type PaperWidth, type ReceiptData, type ReceiptStore } from './escpos';
import { DEFAULT_PRINTER_SETTINGS, readPrinterSettings, savePrinterSettings, type PrinterSettings } from './printerSettings';

function remember(device: { id: string; name?: string }, settings: PrinterSettings): PrinterSettings {
  const next = { ...settings, deviceId: device.id, deviceName: device.name?.trim() || 'Printer' };
  savePrinterSettings(next);
  return next;
}

/**
 * Prints one job. The printer is chosen first, because the browser's chooser needs the tap that
 * started this call; the slower work (reading the store details) happens afterwards.
 */
export async function runPrint(build: (paper: PaperWidth) => Promise<Uint8Array>): Promise<void> {
  const settings = readPrinterSettings();
  const device = await ensurePrinter(settings.deviceId);
  if (device.id !== settings.deviceId) remember(device, settings);
  await sendToPrinter(device, await build(settings.paper));
}

export function printReceipt(
  detail: ReceiptData,
  loadStore: () => Promise<ReceiptStore | null>,
): Promise<void> {
  return runPrint(async (paper) => buildReceiptBytes(detail, await loadStore(), paper));
}

export function printTestPage(): Promise<void> {
  return runPrint(async (paper) => buildTestBytes(paper));
}

/** Chooser only (Lainnya → Hubungkan printer). The choice is remembered on this device. */
export async function connectPrinter(): Promise<PrinterSettings> {
  const device = await pairPrinter();
  return remember(device, readPrinterSettings());
}

export function setPaperWidth(paper: PaperWidth): PrinterSettings {
  const next = { ...readPrinterSettings(), paper };
  savePrinterSettings(next);
  return next;
}

/** Forgets the printer on this device. The browser's own permission is released with the connection. */
export function forgetPrinter(): PrinterSettings {
  releasePrinter();
  const next = { ...DEFAULT_PRINTER_SETTINGS, paper: readPrinterSettings().paper };
  savePrinterSettings(next);
  return next;
}

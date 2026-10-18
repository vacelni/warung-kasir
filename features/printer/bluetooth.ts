/**
 * Bluetooth LE transport for portable thermal printers (Web Bluetooth, Chrome on Android/desktop).
 * Bluetooth Classic (SPP) printers cannot be reached from a web page. Nothing here is sent to the
 * server: the receipt goes from this device straight to the printer.
 *
 * Web Bluetooth is not in TypeScript's DOM library, and adding @types/web-bluetooth is not justified
 * for this small surface (TECHNICAL_SPEC C.15), so only the members used are declared below.
 */

interface PrinterCharacteristic {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithResponse(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
}

interface PrinterService {
  getCharacteristics(): Promise<PrinterCharacteristic[]>;
}

interface PrinterGatt {
  connected: boolean;
  connect(): Promise<PrinterGatt>;
  disconnect(): void;
  getPrimaryServices(): Promise<PrinterService[]>;
}

export interface PrinterDevice {
  id: string;
  name?: string;
  gatt?: PrinterGatt;
}

interface BluetoothApi {
  requestDevice(options: { acceptAllDevices: true; optionalServices: string[] }): Promise<PrinterDevice>;
  getDevices?(): Promise<PrinterDevice[]>;
}

/**
 * Services that common ESC/POS portable printers expose for printing. A page can only use services
 * it names before pairing, so the list has to cover the families on the market.
 */
export const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '38eb4a80-c570-11e3-9507-0002a5d5c51b',
] as const;

/** Bytes per write, and the pause after it, so a small printer buffer is never overrun. */
const CHUNK_WITH_RESPONSE = 100;
const CHUNK_WITHOUT_RESPONSE = 20;
const PAUSE_WITHOUT_RESPONSE_MS = 25;

export type PrintFailure = 'unsupported' | 'cancelled' | 'connect' | 'noPrintService' | 'write';

export class PrintError extends Error {
  constructor(
    readonly failure: PrintFailure,
    options?: { cause?: unknown },
  ) {
    super(failure, options);
    this.name = 'PrintError';
  }
}

const MESSAGES: Record<Exclude<PrintFailure, 'cancelled'>, string> = {
  unsupported: 'Browser ini tidak mendukung cetak Bluetooth. Gunakan Chrome di Android atau komputer.',
  connect: 'Printer tidak dapat dihubungi. Nyalakan printer, dekatkan ke HP, lalu coba lagi.',
  noPrintService: 'Perangkat ini bukan printer struk yang didukung. Pilih printer lain.',
  write: 'Struk gagal dikirim ke printer. Periksa kertas dan baterai printer, lalu coba lagi.',
};

/** What to tell the user (UI_SPEC A.21). Null when they simply closed the device chooser. */
export function printErrorMessage(error: unknown): string | null {
  if (error instanceof PrintError) return error.failure === 'cancelled' ? null : MESSAGES[error.failure];
  return MESSAGES.write;
}

function bluetooth(): BluetoothApi | null {
  const api = (globalThis.navigator as { bluetooth?: BluetoothApi } | undefined)?.bluetooth;
  return api ?? null;
}

export function isBluetoothSupported(): boolean {
  return bluetooth() !== null;
}

/** The printer chosen in this page session, reused so the chooser does not open for every receipt. */
let current: PrinterDevice | null = null;

function isUserCancel(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'AbortError');
}

/** Opens the browser's device chooser. Must run inside a tap (a user gesture). */
export async function pairPrinter(): Promise<PrinterDevice> {
  const api = bluetooth();
  if (!api) throw new PrintError('unsupported');
  try {
    current = await api.requestDevice({ acceptAllDevices: true, optionalServices: [...PRINTER_SERVICES] });
  } catch (error) {
    throw new PrintError(isUserCancel(error) ? 'cancelled' : 'connect', { cause: error });
  }
  return current;
}

/** The remembered printer if the browser still allows it, without opening the chooser. */
async function rememberedPrinter(deviceId: string | null): Promise<PrinterDevice | null> {
  if (current && (deviceId === null || current.id === deviceId)) return current;
  const api = bluetooth();
  if (!api?.getDevices || deviceId === null) return null;
  try {
    const devices = await api.getDevices();
    current = devices.find((device) => device.id === deviceId) ?? null;
  } catch (error) {
    console.warn('Could not list the paired printers; the chooser will open instead:', error);
    current = null;
  }
  return current;
}

/**
 * The printer to use: the remembered one, or the chooser when the browser forgot it (a new page
 * session on a browser without persistent Bluetooth permissions). Run it first in the tap handler.
 */
export async function ensurePrinter(deviceId: string | null): Promise<PrinterDevice> {
  return (await rememberedPrinter(deviceId)) ?? pairPrinter();
}

async function findWriter(gatt: PrinterGatt): Promise<PrinterCharacteristic> {
  const services = await gatt.getPrimaryServices();
  for (const service of services) {
    const characteristics = await service.getCharacteristics();
    const writer = characteristics.find((c) => c.properties.write || c.properties.writeWithoutResponse);
    if (writer) return writer;
  }
  throw new PrintError('noPrintService');
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Sends `bytes` in small writes. Reconnects if the printer went to sleep since the last receipt. */
export async function sendToPrinter(device: PrinterDevice, bytes: Uint8Array): Promise<void> {
  const gatt = device.gatt;
  if (!gatt) throw new PrintError('unsupported');

  let writer: PrinterCharacteristic;
  try {
    const connected = gatt.connected ? gatt : await gatt.connect();
    writer = await findWriter(connected);
  } catch (error) {
    if (error instanceof PrintError) throw error;
    current = null;
    throw new PrintError('connect', { cause: error });
  }

  const withResponse = writer.properties.write;
  const size = withResponse ? CHUNK_WITH_RESPONSE : CHUNK_WITHOUT_RESPONSE;
  try {
    for (let offset = 0; offset < bytes.length; offset += size) {
      const chunk = bytes.slice(offset, offset + size);
      if (withResponse) {
        await writer.writeValueWithResponse(chunk);
      } else {
        await writer.writeValueWithoutResponse(chunk);
        await pause(PAUSE_WITHOUT_RESPONSE_MS);
      }
    }
  } catch (error) {
    throw new PrintError('write', { cause: error });
  }
}

/** Closes the link, e.g. after the printer is forgotten. */
export function releasePrinter(): void {
  try {
    current?.gatt?.disconnect();
  } catch (error) {
    console.warn('Could not disconnect the printer:', error);
  }
  current = null;
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PrintError,
  ensurePrinter,
  isBluetoothSupported,
  pairPrinter,
  printErrorMessage,
  releasePrinter,
  sendToPrinter,
  type PrinterDevice,
} from './bluetooth';

type FakeWriter = {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithResponse: ReturnType<typeof vi.fn>;
  writeValueWithoutResponse: ReturnType<typeof vi.fn>;
};

function writer(kind: 'response' | 'noResponse'): FakeWriter {
  return {
    properties: { write: kind === 'response', writeWithoutResponse: kind === 'noResponse' },
    writeValueWithResponse: vi.fn().mockResolvedValue(undefined),
    writeValueWithoutResponse: vi.fn().mockResolvedValue(undefined),
  };
}

function fakeDevice(characteristics: unknown[], overrides: { connected?: boolean } = {}): PrinterDevice {
  const gatt = {
    connected: overrides.connected ?? true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getPrimaryServices: vi.fn().mockResolvedValue([{ getCharacteristics: vi.fn().mockResolvedValue(characteristics) }]),
  };
  gatt.connect.mockResolvedValue(gatt);
  return { id: 'printer-1', name: 'MHT-P29L', gatt };
}

function setBluetooth(api: unknown) {
  Object.defineProperty(globalThis.navigator, 'bluetooth', { value: api, configurable: true });
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  releasePrinter();
  Reflect.deleteProperty(globalThis.navigator, 'bluetooth');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('support', () => {
  it('reports no Bluetooth when the browser lacks Web Bluetooth', () => {
    expect(isBluetoothSupported()).toBe(false);
  });

  it('refuses to pair without Web Bluetooth, with a message the user can act on', async () => {
    const error = await pairPrinter().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PrintError);
    expect(printErrorMessage(error)).toMatch(/Chrome/);
  });
});

describe('pairPrinter', () => {
  it('opens the chooser with the printer services allowed', async () => {
    const device = fakeDevice([]);
    const requestDevice = vi.fn().mockResolvedValue(device);
    setBluetooth({ requestDevice });

    await expect(pairPrinter()).resolves.toBe(device);
    expect(requestDevice).toHaveBeenCalledWith(
      expect.objectContaining({ acceptAllDevices: true, optionalServices: expect.arrayContaining(['000018f0-0000-1000-8000-00805f9b34fb']) }),
    );
  });

  it('treats closing the chooser as a cancel, not as an error to show', async () => {
    setBluetooth({ requestDevice: vi.fn().mockRejectedValue(new DOMException('No device selected', 'NotFoundError')) });
    const error = await pairPrinter().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PrintError);
    expect(printErrorMessage(error)).toBeNull();
  });
});

describe('ensurePrinter', () => {
  it('reuses the remembered printer without opening the chooser', async () => {
    const device = fakeDevice([]);
    const requestDevice = vi.fn();
    setBluetooth({ requestDevice, getDevices: vi.fn().mockResolvedValue([device]) });

    await expect(ensurePrinter('printer-1')).resolves.toBe(device);
    expect(requestDevice).not.toHaveBeenCalled();
  });

  it('opens the chooser when the browser no longer knows the remembered printer', async () => {
    const other = fakeDevice([]);
    const requestDevice = vi.fn().mockResolvedValue(other);
    setBluetooth({ requestDevice, getDevices: vi.fn().mockResolvedValue([]) });

    await expect(ensurePrinter('gone')).resolves.toBe(other);
    expect(requestDevice).toHaveBeenCalledOnce();
  });
});

describe('sendToPrinter', () => {
  it('writes everything in order, in chunks, when the printer acknowledges writes', async () => {
    const w = writer('response');
    const bytes = Uint8Array.from({ length: 250 }, (_, i) => i % 256);

    await sendToPrinter(fakeDevice([w]), bytes);

    expect(w.writeValueWithResponse).toHaveBeenCalledTimes(3);
    const sent = w.writeValueWithResponse.mock.calls.flatMap(([chunk]) => [...(chunk as Uint8Array)]);
    expect(sent).toEqual([...bytes]);
  });

  it('uses small writes with a pause when the printer only takes writes without response', async () => {
    vi.useFakeTimers();
    const w = writer('noResponse');
    const bytes = new Uint8Array(45).fill(7);

    const done = sendToPrinter(fakeDevice([w]), bytes);
    await vi.runAllTimersAsync();
    await done;

    expect(w.writeValueWithoutResponse).toHaveBeenCalledTimes(3);
    expect((w.writeValueWithoutResponse.mock.calls[0]![0] as Uint8Array).length).toBe(20);
    expect(w.writeValueWithResponse).not.toHaveBeenCalled();
  });

  it('reconnects when the printer went to sleep', async () => {
    const w = writer('response');
    const device = fakeDevice([w], { connected: false });

    await sendToPrinter(device, new Uint8Array([1, 2, 3]));

    expect(device.gatt!.connect).toHaveBeenCalledOnce();
    expect(w.writeValueWithResponse).toHaveBeenCalledOnce();
  });

  it('says so when the device has no writable characteristic', async () => {
    const readOnly = { properties: { write: false, writeWithoutResponse: false } };
    const error = await sendToPrinter(fakeDevice([readOnly]), new Uint8Array([1])).catch((e: unknown) => e);
    expect(error).toMatchObject({ failure: 'noPrintService' });
  });

  it('reports a connection failure and a write failure separately', async () => {
    const down = fakeDevice([], { connected: false });
    vi.mocked(down.gatt!.connect).mockRejectedValue(new Error('out of range'));
    await expect(sendToPrinter(down, new Uint8Array([1]))).rejects.toMatchObject({ failure: 'connect' });

    const w = writer('response');
    w.writeValueWithResponse.mockRejectedValue(new Error('GATT write failed'));
    await expect(sendToPrinter(fakeDevice([w]), new Uint8Array([1]))).rejects.toMatchObject({ failure: 'write' });
  });
});

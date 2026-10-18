// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '@/features/auth/account';
import { PrintError } from './bluetooth';
import type { ReceiptData } from './escpos';
import { PrintReceiptButton } from './PrintReceiptButton';

const mocks = vi.hoisted(() => ({ printReceipt: vi.fn(), loadReceiptStore: vi.fn() }));

const profile: Profile = { id: 'cashier-1', storeId: 'store-a', name: 'Andi', role: 'cashier' };

vi.mock('@/features/auth/AuthProvider', () => ({ useProfile: () => profile }));
vi.mock('@/features/transactions/receiptStore', () => ({ loadReceiptStore: mocks.loadReceiptStore }));
vi.mock('./print', () => ({ printReceipt: mocks.printReceipt }));

const detail: ReceiptData = {
  code: 'TRX-20261007-3F9A2C',
  createdAt: '2026-10-07T03:32:00.000Z',
  cashierName: 'Andi',
  lines: [{ productName: 'Es Teh', unitPrice: 5000, quantity: 2, subtotal: 10000, options: [], note: null }],
  total: 10000,
  paidAmount: 10000,
  changeAmount: 0,
};

beforeEach(() => {
  mocks.printReceipt.mockReset();
  mocks.loadReceiptStore.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PrintReceiptButton', () => {
  it('prints the sale and says it was sent', async () => {
    mocks.printReceipt.mockResolvedValue(undefined);
    render(<PrintReceiptButton detail={detail} />);

    fireEvent.click(screen.getByRole('button', { name: 'CETAK STRUK' }));

    await waitFor(() => expect(screen.getByText('Struk dikirim ke printer.')).toBeTruthy());
    expect(mocks.printReceipt).toHaveBeenCalledWith(detail, expect.any(Function));
  });

  it('reads the store details for the signed-in cashier', async () => {
    mocks.printReceipt.mockImplementation(async (_detail: ReceiptData, loadStore: () => Promise<unknown>) => {
      await loadStore();
    });
    mocks.loadReceiptStore.mockResolvedValue(null);
    render(<PrintReceiptButton detail={detail} />);

    fireEvent.click(screen.getByRole('button', { name: 'CETAK STRUK' }));

    await waitFor(() => expect(mocks.loadReceiptStore).toHaveBeenCalledWith('cashier-1', 'store-a'));
  });

  it('ignores a second tap while printing, so one tap-pair prints one receipt', async () => {
    let finish: () => void = () => {};
    mocks.printReceipt.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    render(<PrintReceiptButton detail={detail} />);

    const button = screen.getByRole('button', { name: 'CETAK STRUK' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(mocks.printReceipt).toHaveBeenCalledOnce();
    expect((screen.getByRole('button', { name: 'MENCETAK…' }) as HTMLButtonElement).disabled).toBe(true);
    finish();
    await waitFor(() => expect(screen.getByText('Struk dikirim ke printer.')).toBeTruthy());
  });

  it('shows what failed and lets the user try again', async () => {
    mocks.printReceipt.mockRejectedValueOnce(new PrintError('connect')).mockResolvedValueOnce(undefined);
    render(<PrintReceiptButton detail={detail} />);

    fireEvent.click(screen.getByRole('button', { name: 'CETAK STRUK' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Printer tidak dapat dihubungi/));

    fireEvent.click(screen.getByRole('button', { name: 'CETAK STRUK' }));
    await waitFor(() => expect(screen.getByText('Struk dikirim ke printer.')).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows nothing when the user closes the device chooser', async () => {
    mocks.printReceipt.mockRejectedValue(new PrintError('cancelled'));
    render(<PrintReceiptButton detail={detail} />);

    fireEvent.click(screen.getByRole('button', { name: 'CETAK STRUK' }));

    await waitFor(() => expect((screen.getByRole('button', { name: 'CETAK STRUK' }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Struk dikirim ke printer.')).toBeNull();
  });
});

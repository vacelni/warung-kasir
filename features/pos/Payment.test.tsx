// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '@/features/auth/account';
import { getOutboxEntry, listSyncable, markNotSynced, markSynced, markSyncing } from '@/features/offline/outbox';
import { syncManager } from '@/features/offline/syncManager';
import type { TransactionSnapshot } from '@/lib/checkout';
import { resetIndexedDb } from '@/lib/test-support/fakeIndexedDb';
import { testSnapshot } from '@/lib/test-support/transactions';
import { CartProvider, useCart } from './CartProvider';
import { CheckoutSuccess } from './CheckoutSuccess';
import { PaymentForm } from './PaymentForm';

const cashier: Profile = { id: 'cashier-1', storeId: 'store-a', name: 'Andi', role: 'cashier' };

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  prefetch: vi.fn(),
  searchParams: new URLSearchParams(),
  syncOnce: vi.fn(),
  failNextEnqueue: false as false | 'error' | 'quota',
  enqueued: [] as TransactionSnapshot[],
}));

vi.mock('@/features/auth/AuthProvider', () => ({ useProfile: () => cashier }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push, prefetch: mocks.prefetch }),
  useSearchParams: () => mocks.searchParams,
}));
// The sync manager is real; only the network pass it runs is replaced.
vi.mock('@/features/offline/sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/offline/sync')>()),
  syncOnce: mocks.syncOnce,
}));
// The real outbox (on fake-indexeddb), with a switch to make the next write fail.
vi.mock('@/features/offline/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/offline/outbox')>();
  return {
    ...actual,
    enqueueTransaction: async (snapshot: TransactionSnapshot) => {
      mocks.enqueued.push(snapshot);
      if (mocks.failNextEnqueue) {
        const kind = mocks.failNextEnqueue;
        mocks.failNextEnqueue = false;
        // What IndexedDB throws when the device storage is full.
        if (kind === 'quota') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        throw new Error('UnknownError: storage unavailable');
      }
      return actual.enqueueTransaction(snapshot);
    },
  };
});

const NASI = { id: 'd0000000-0000-4000-8000-000000000001', name: 'Nasi Goreng', price: 15000 };
const TEH = { id: 'd0000000-0000-4000-8000-000000000004', name: 'Es Teh', price: 5000 };

/** Fills the cart with Nasi Goreng ×2 + Es Teh ×2 (Rp40.000) and shows the item count, like the menu would. */
function GoldenOrder() {
  const { add, itemCount } = useCart();
  const added = useRef(false);
  useEffect(() => {
    if (added.current) return;
    added.current = true;
    for (const product of [NASI, NASI, TEH, TEH]) add(product);
  }, [add]);
  return <p data-testid="cart-count">{itemCount}</p>;
}

function renderPayment({ withOrder = true } = {}) {
  return render(
    <CartProvider>
      {withOrder && <GoldenOrder />}
      <PaymentForm />
    </CartProvider>,
  );
}

const paidInput = () => screen.getByLabelText('Uang diterima') as HTMLInputElement;
const payButton = () => screen.getByRole('button', { name: 'BAYAR' });
const typePaid = (value: string) => fireEvent.change(paidInput(), { target: { value } });
const quick = (name: string) =>
  within(screen.getByRole('group', { name: 'Nominal cepat' })).getByRole('button', { name });
const changeAmount = () => within(screen.getByRole('region', { name: 'Kembalian' })).getAllByText(/Rp|–/)[0]?.textContent;

beforeEach(async () => {
  await resetIndexedDb();
  mocks.replace.mockReset();
  mocks.push.mockReset();
  mocks.prefetch.mockReset();
  mocks.syncOnce.mockReset();
  mocks.syncOnce.mockResolvedValue({ synced: 0, pending: 0, failed: 0 });
  mocks.searchParams = new URLSearchParams();
  mocks.failNextEnqueue = false;
  mocks.enqueued = [];
  // The app shell starts the sync agent for the signed-in cashier.
  syncManager.setCashier(cashier.id);
});

afterEach(() => {
  cleanup();
  syncManager.setCashier(null);
});

describe('PaymentForm (UI_SPEC A.12–A.13, TEST_PLAN G.4)', () => {
  it('shows the total and a numeric payment field; Bayar waits for an amount', async () => {
    renderPayment();

    const total = await screen.findByRole('region', { name: 'Total' });
    expect(total.textContent).toContain('Rp40.000');
    expect(total.textContent).toContain('4 item');
    expect(paidInput().getAttribute('inputmode')).toBe('numeric');
    expect(paidInput().value).toBe('');
    expect((payButton() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/Uang pembayaran kurang/)).toBeNull();
  });

  it('total 40000, paid 50000 → change Rp10.000 and Bayar enabled (AC-04)', async () => {
    renderPayment();
    await screen.findByText('Rp40.000');

    typePaid('50000');

    expect(paidInput().value).toBe('Rp50.000');
    expect(changeAmount()).toBe('Rp10.000');
    expect((payButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it('total 40000, paid 30000 → "Uang pembayaran kurang Rp10.000" and Bayar disabled (AC-05)', async () => {
    renderPayment();
    await screen.findByText('Rp40.000');

    typePaid('30000');

    const message = screen.getByText('Uang pembayaran kurang Rp10.000');
    const panel = message.closest('[role="status"]') as HTMLElement;
    expect(within(panel).getByText('Dibayar').nextElementSibling?.textContent).toBe('Rp30.000');
    expect(within(panel).getByText('Kurang').nextElementSibling?.textContent).toBe('Rp10.000');
    expect(paidInput().getAttribute('aria-invalid')).toBe('true');
    expect((payButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('a payment of Rp0 is short by the whole total', async () => {
    renderPayment();
    await screen.findByText('Rp40.000');

    typePaid('0');

    expect(screen.getByText('Uang pembayaran kurang Rp40.000')).toBeTruthy();
    expect((payButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('exact payment gives change Rp0', async () => {
    renderPayment();
    await screen.findByText('Rp40.000');

    typePaid('40000');

    expect(changeAmount()).toBe('Rp0');
    expect((payButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it('a quick amount SETS the paid amount: paid 20000, tap Rp50.000 → 50000, not 70000 (C20)', async () => {
    renderPayment();
    await screen.findByText('Rp40.000');

    typePaid('20000');
    fireEvent.click(quick('Rp50.000'));

    expect(paidInput().value).toBe('Rp50.000');
    expect(changeAmount()).toBe('Rp10.000');
  });

  it('offers Rp10.000, Rp20.000, Rp50.000, Rp100.000, Rp200.000 and Uang Pas', async () => {
    renderPayment();
    await screen.findByText('Rp40.000');

    const buttons = within(screen.getByRole('group', { name: 'Nominal cepat' })).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Rp10.000',
      'Rp20.000',
      'Rp50.000',
      'Rp100.000',
      'Rp200.000',
      'UANG PAS',
    ]);
  });

  it('Uang Pas sets paid = total and change Rp0', async () => {
    renderPayment();
    await screen.findByText('Rp40.000');

    typePaid('100000');
    fireEvent.click(quick('UANG PAS'));

    expect(paidInput().value).toBe('Rp40.000');
    expect(changeAmount()).toBe('Rp0');
  });

  it('manual input after a quick amount replaces the value', async () => {
    renderPayment();
    await screen.findByText('Rp40.000');

    fireEvent.click(quick('Rp100.000'));
    typePaid('45000');

    expect(paidInput().value).toBe('Rp45.000');
    expect(changeAmount()).toBe('Rp5.000');
  });

  it('ignores letters and refuses amounts beyond the database limit', async () => {
    renderPayment();
    await screen.findByText('Rp40.000');

    typePaid('abc');
    expect(paidInput().value).toBe('');

    typePaid('50000');
    typePaid('99999999999');
    expect(paidInput().value).toBe('Rp50.000');
  });

  it('Bayar saves the sale to the outbox, clears the cart, and opens the success screen', async () => {
    renderPayment();
    await screen.findByText('Rp40.000');
    typePaid('50000');

    fireEvent.click(payButton());

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledOnce());
    const [url] = mocks.replace.mock.calls[0] as [string];
    const id = new URL(url, 'http://x').searchParams.get('id');
    expect(url).toMatch(/^\/kasir\/selesai\?id=/);

    expect(await getOutboxEntry(id!)).toMatchObject({
      id,
      code: expect.stringMatching(new RegExp(`^TRX-\\d{8}-${id!.slice(0, 6).toUpperCase()}$`)),
      store_id: 'store-a',
      cashier_id: 'cashier-1',
      total: 40000,
      paid_amount: 50000,
      change_amount: 10000,
      sync_status: 'pending',
      items: [
        { product_id: NASI.id, product_name: 'Nasi Goreng', unit_price: 15000, quantity: 2, subtotal: 30000 },
        { product_id: TEH.id, product_name: 'Es Teh', unit_price: 5000, quantity: 2, subtotal: 10000 },
      ],
    });
    expect(screen.getByTestId('cart-count').textContent).toBe('0');
  });

  it('a double tap on Bayar creates exactly one outbox entry (G.4)', async () => {
    renderPayment();
    await screen.findByText('Rp40.000');
    typePaid('50000');

    // Both taps land before React re-renders the button as disabled.
    const button = payButton();
    act(() => {
      button.click();
      button.click();
    });

    await waitFor(() => expect(mocks.replace).toHaveBeenCalled());
    expect(mocks.enqueued).toHaveLength(1);
    expect(await listSyncable('cashier-1')).toHaveLength(1);
    expect(mocks.replace).toHaveBeenCalledOnce();
  });

  it('disables Bayar while saving', async () => {
    renderPayment();
    await screen.findByText('Rp40.000');
    typePaid('50000');

    fireEvent.click(payButton());

    const saving = screen.getByRole('button', { name: /MENYIMPAN/ }) as HTMLButtonElement;
    expect(saving.disabled).toBe(true);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalled());
  });

  it('a failed device save keeps the order, explains it, and the retry uses the same UUID and sale time', async () => {
    renderPayment();
    await screen.findByText('Rp40.000');
    typePaid('50000');
    mocks.failNextEnqueue = 'error';

    fireEvent.click(payButton());

    expect(await screen.findByText(/Gagal menyimpan transaksi di perangkat ini/)).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByTestId('cart-count').textContent).toBe('4');

    fireEvent.click(payButton());
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledOnce());

    const [failed, retried] = mocks.enqueued as [TransactionSnapshot, TransactionSnapshot];
    expect(retried.id).toBe(failed.id);
    expect(retried.created_at).toBe(failed.created_at);
    expect(retried.code).toBe(failed.code);
  });

  it('full device storage: says so, keeps the order, never shows success (no false "saved")', async () => {
    renderPayment();
    await screen.findByText('Rp40.000');
    typePaid('50000');
    mocks.failNextEnqueue = 'quota';

    fireEvent.click(payButton());

    expect(await screen.findByText(/Penyimpanan perangkat penuh\. Transaksi belum tersimpan\./)).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByTestId('cart-count').textContent).toBe('4');
    expect(await listSyncable(cashier.id)).toEqual([]);
    expect((payButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the empty cart state when there is nothing to pay', () => {
    renderPayment({ withOrder: false });

    expect(screen.getByRole('heading', { name: 'Keranjang masih kosong.' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'PILIH MENU' }).getAttribute('href')).toBe('/kasir');
    expect(screen.queryByRole('button', { name: 'BAYAR' })).toBeNull();
  });
});

describe('CheckoutSuccess (UI_SPEC A.14)', () => {
  const ID = testSnapshot().id;

  async function saveSale() {
    const { enqueueTransaction } = await import('@/features/offline/outbox');
    await enqueueTransaction(testSnapshot());
  }

  function renderSuccess(id: string | null = ID) {
    mocks.searchParams = new URLSearchParams(id ? { id } : {});
    return render(
      <CartProvider>
        <GoldenOrder />
        <CheckoutSuccess />
      </CartProvider>,
    );
  }

  it('shows the code, total, paid, change, and syncs right after checkout', async () => {
    await saveSale();
    mocks.syncOnce.mockImplementation(async () => {
      await markSyncing(ID, new Date());
      await markSynced(ID);
      return { synced: 1, pending: 0, failed: 0 };
    });

    renderSuccess();

    expect(await screen.findByRole('heading', { name: 'Transaksi Berhasil', level: 1 })).toBeTruthy();
    expect(screen.getByText('TRX-20261007-3F9A2C')).toBeTruthy();
    expect(screen.getByText('Total').nextElementSibling?.textContent).toBe('Rp40.000');
    expect(screen.getByText('Dibayar').nextElementSibling?.textContent).toBe('Rp50.000');
    expect(screen.getByText('Kembalian').nextElementSibling?.textContent).toBe('Rp10.000');

    expect(await screen.findByText('Tersinkron')).toBeTruthy();
    expect(mocks.syncOnce).toHaveBeenCalledWith('cashier-1');
  });

  it('keeps showing the sale as saved when sync cannot reach the server, and offers a retry', async () => {
    await saveSale();
    mocks.syncOnce.mockImplementation(async () => {
      await markSyncing(ID, new Date());
      await markNotSynced(ID, 'pending', 'TypeError: Failed to fetch');
      return { synced: 0, pending: 1, failed: 0 };
    });

    renderSuccess();

    expect(await screen.findByText('Tersimpan • Menunggu sinkronisasi')).toBeTruthy();
    expect(screen.getByText('Transaksi tersimpan di perangkat. Sinkronisasi akan dicoba kembali.')).toBeTruthy();

    mocks.syncOnce.mockImplementation(async () => {
      await markSyncing(ID, new Date());
      await markSynced(ID);
      return { synced: 1, pending: 0, failed: 0 };
    });
    fireEvent.click(screen.getByRole('button', { name: 'COBA LAGI' }));

    expect(await screen.findByText('Tersinkron')).toBeTruthy();
    expect(mocks.syncOnce).toHaveBeenCalledTimes(2);
    expect((await getOutboxEntry(ID))?.attempts).toBe(2);
  });

  it('shows a rejected sale as failed and keeps it on the device', async () => {
    await saveSale();
    mocks.syncOnce.mockImplementation(async () => {
      await markNotSynced(ID, 'failed', 'WK002: inactive');
      return { synced: 0, pending: 0, failed: 1 };
    });

    renderSuccess();

    expect(await screen.findByText('Gagal sinkron')).toBeTruthy();
    // The reason, in words the cashier can act on.
    expect(screen.getByText(/Akun kasir ini tidak aktif di server/)).toBeTruthy();
    expect(await getOutboxEntry(ID)).toMatchObject({ sync_status: 'failed', last_error: 'WK002: inactive' });
    expect(mocks.syncOnce).toHaveBeenCalledOnce();

    // Coba Lagi (UI_SPEC A.24): back to pending, then the same sale is sent again.
    mocks.syncOnce.mockImplementation(async () => {
      expect((await getOutboxEntry(ID))?.sync_status).toBe('pending');
      await markSyncing(ID, new Date());
      await markSynced(ID);
      return { synced: 1, pending: 0, failed: 0 };
    });
    fireEvent.click(screen.getByRole('button', { name: 'COBA LAGI' }));

    expect(await screen.findByText('Tersinkron')).toBeTruthy();
    expect(mocks.syncOnce).toHaveBeenCalledTimes(2);
  });

  it('does not sync again when the sale is already synced', async () => {
    await saveSale();
    await markSynced(ID);

    renderSuccess();

    expect(await screen.findByText('Tersinkron')).toBeTruthy();
    expect(mocks.syncOnce).not.toHaveBeenCalled();
  });

  it('Lihat Detail opens this sale in the history detail by UUID (A.14)', async () => {
    await saveSale();
    renderSuccess();
    await screen.findByRole('heading', { name: 'Transaksi Berhasil' });

    const link = screen.getByRole('link', { name: 'LIHAT DETAIL' });
    expect(link.getAttribute('href')).toBe(`/riwayat/detail?id=${ID}`);
  });

  it('Transaksi Baru clears the cart and opens the menu', async () => {
    await saveSale();
    renderSuccess();
    await screen.findByRole('heading', { name: 'Transaksi Berhasil' });
    await waitFor(() => expect(screen.getByTestId('cart-count').textContent).toBe('4'));

    fireEvent.click(screen.getByRole('button', { name: 'TRANSAKSI BARU' }));

    expect(screen.getByTestId('cart-count').textContent).toBe('0');
    expect(mocks.push).toHaveBeenCalledWith('/kasir');
  });

  it('does not show another cashier’s sale', async () => {
    const { enqueueTransaction } = await import('@/features/offline/outbox');
    await enqueueTransaction(testSnapshot({ cashier_id: 'cashier-2' }));

    renderSuccess();

    expect(await screen.findByRole('heading', { name: 'Transaksi tidak ditemukan' })).toBeTruthy();
    expect(mocks.syncOnce).not.toHaveBeenCalled();
  });

  it('explains a missing id', () => {
    renderSuccess(null);

    expect(screen.getByRole('heading', { name: 'Transaksi tidak ditemukan' })).toBeTruthy();
  });
});

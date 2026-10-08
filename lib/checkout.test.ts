import { describe, expect, it } from 'vitest';
import { addProduct, EMPTY_CART, increaseQuantity, type Cart } from './cart';
import {
  buildTransaction,
  checkPayment,
  createCheckoutId,
  formatAmountInput,
  MAX_AMOUNT,
  parseAmountInput,
  QUICK_AMOUNTS,
  shortfallMessage,
  transactionCode,
} from './checkout';

const NASI = { id: 'd0000000-0000-4000-8000-000000000001', name: 'Nasi Goreng', price: 15000 };
const TEH = { id: 'd0000000-0000-4000-8000-000000000004', name: 'Es Teh', price: 5000 };

/** Nasi Goreng ×2 + Es Teh ×2 = Rp40.000 (the golden path order). */
function goldenCart(): Cart {
  let cart = addProduct(addProduct(EMPTY_CART, NASI), TEH);
  cart = increaseQuantity(increaseQuantity(cart, NASI.id), TEH.id);
  return cart;
}

const ID = '3f9a2c4e-7b1d-4c2a-9e10-000000000001';
const SALE_TIME = new Date('2026-10-07T10:32:00+07:00');

describe('checkPayment (TEST_PLAN G.4, AC-04, AC-05)', () => {
  it('total 40000, paid 50000 → change 10000', () => {
    expect(checkPayment(40000, 50000)).toEqual({ status: 'ok', change: 10000 });
  });

  it('exact payment → change 0', () => {
    expect(checkPayment(40000, 40000)).toEqual({ status: 'ok', change: 0 });
  });

  it('total 40000, paid 30000 → denied with a shortfall of 10000', () => {
    expect(checkPayment(40000, 30000)).toEqual({ status: 'short', shortfall: 10000 });
  });

  it('a paid amount of 0 is short by the whole total', () => {
    expect(checkPayment(40000, 0)).toEqual({ status: 'short', shortfall: 40000 });
  });

  it('nothing entered yet is neither valid nor an error', () => {
    expect(checkPayment(40000, null)).toEqual({ status: 'empty' });
  });

  it('stays exact at the integer limit', () => {
    expect(checkPayment(MAX_AMOUNT - 1, MAX_AMOUNT)).toEqual({ status: 'ok', change: 1 });
  });

  it('rejects fractional amounts instead of computing with floats', () => {
    expect(() => checkPayment(40000, 50000.5)).toThrow(RangeError);
  });
});

describe('shortfallMessage (PRD §17)', () => {
  it('reads exactly as specified, with no space after Rp', () => {
    expect(shortfallMessage(10000)).toBe('Uang pembayaran kurang Rp10.000');
    expect(shortfallMessage(1250000)).toBe('Uang pembayaran kurang Rp1.250.000');
  });
});

describe('quick amounts (decision C20)', () => {
  it('are Rp10.000, Rp20.000, Rp50.000, Rp100.000, Rp200.000', () => {
    expect(QUICK_AMOUNTS).toEqual([10000, 20000, 50000, 100000, 200000]);
  });
});

describe('parseAmountInput', () => {
  it('reads digits only, so the formatted field value round-trips', () => {
    expect(parseAmountInput('50000')).toEqual({ ok: true, amount: 50000 });
    expect(parseAmountInput('Rp50.000')).toEqual({ ok: true, amount: 50000 });
    expect(parseAmountInput(formatAmountInput(1250000))).toEqual({ ok: true, amount: 1250000 });
  });

  it('treats the dot as a thousands separator, never as a decimal point', () => {
    expect(parseAmountInput('12.500')).toEqual({ ok: true, amount: 12500 });
  });

  it('typing after a formatted value appends a digit', () => {
    // The field shows "Rp5.000"; typing 0 at the end gives "Rp5.0000" → 50000.
    expect(parseAmountInput('Rp5.0000')).toEqual({ ok: true, amount: 50000 });
  });

  it('an empty field (or only non-digits) is empty, not zero', () => {
    expect(parseAmountInput('')).toEqual({ ok: true, amount: null });
    expect(parseAmountInput('Rp')).toEqual({ ok: true, amount: null });
  });

  it('keeps an explicit zero and drops leading zeros', () => {
    expect(parseAmountInput('0')).toEqual({ ok: true, amount: 0 });
    expect(parseAmountInput('Rp05')).toEqual({ ok: true, amount: 5 });
  });

  it('ignores a minus sign: a payment is never negative', () => {
    expect(parseAmountInput('-5000')).toEqual({ ok: true, amount: 5000 });
  });

  it('refuses amounts above the database integer limit', () => {
    expect(parseAmountInput(String(MAX_AMOUNT))).toEqual({ ok: true, amount: MAX_AMOUNT });
    expect(parseAmountInput(String(MAX_AMOUNT + 1))).toEqual({ ok: false });
    expect(parseAmountInput('99999999999999999999999')).toEqual({ ok: false });
  });
});

describe('formatAmountInput', () => {
  it('shows Rupiah without a space, or nothing when empty', () => {
    expect(formatAmountInput(50000)).toBe('Rp50.000');
    expect(formatAmountInput(0)).toBe('Rp0');
    expect(formatAmountInput(null)).toBe('');
  });
});

describe('transactionCode (decision D2)', () => {
  it('is TRX-<Asia/Jakarta date>-<first 6 hex of the UUID, uppercase>', () => {
    expect(transactionCode(ID, SALE_TIME)).toBe('TRX-20261007-3F9A2C');
  });

  it('uses the Asia/Jakarta date: 00:30 WIB is the new day even though UTC is still the day before', () => {
    expect(transactionCode(ID, new Date('2026-10-08T00:30:00+07:00'))).toBe('TRX-20261008-3F9A2C');
    expect(transactionCode(ID, new Date('2026-10-07T23:30:00+07:00'))).toBe('TRX-20261007-3F9A2C');
  });

  it('uppercases hex letters', () => {
    expect(transactionCode('abcdef12-0000-4000-8000-000000000000', SALE_TIME)).toBe('TRX-20261007-ABCDEF');
  });

  it('rejects an id that is not a UUID', () => {
    expect(() => transactionCode('TRX-1', SALE_TIME)).toThrow(RangeError);
  });
});

describe('createCheckoutId', () => {
  it('creates a new random v4 UUID each time', () => {
    const a = createCheckoutId();
    const b = createCheckoutId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});

describe('buildTransaction', () => {
  const base = { id: ID, createdAt: SALE_TIME, cashierId: 'cashier-1', storeId: 'store-1' };

  it('builds the full snapshot for Nasi Goreng ×2 + Es Teh ×2 paid with Rp50.000', () => {
    expect(buildTransaction({ ...base, cart: goldenCart(), paid: 50000 })).toEqual({
      id: ID,
      code: 'TRX-20261007-3F9A2C',
      store_id: 'store-1',
      cashier_id: 'cashier-1',
      created_at: '2026-10-07T03:32:00.000Z',
      items: [
        { product_id: NASI.id, product_name: 'Nasi Goreng', unit_price: 15000, quantity: 2, subtotal: 30000 },
        { product_id: TEH.id, product_name: 'Es Teh', unit_price: 5000, quantity: 2, subtotal: 10000 },
      ],
      total: 40000,
      paid_amount: 50000,
      change_amount: 10000,
    });
  });

  it('keeps the cart price snapshot, not any newer catalog price', () => {
    // The cart was filled at Rp15.000; even if the menu now says otherwise, the sale keeps it.
    const snapshot = buildTransaction({ ...base, cart: goldenCart(), paid: 40000 });
    expect(snapshot.items[0]).toMatchObject({ unit_price: 15000, product_name: 'Nasi Goreng' });
    expect(snapshot.change_amount).toBe(0);
  });

  it('is deterministic for the same id and sale time, so a retry sends the same sale', () => {
    const first = buildTransaction({ ...base, cart: goldenCart(), paid: 50000 });
    const retry = buildTransaction({ ...base, cart: goldenCart(), paid: 50000 });
    expect(retry).toEqual(first);
  });

  it('refuses an underpaid sale', () => {
    expect(() => buildTransaction({ ...base, cart: goldenCart(), paid: 30000 })).toThrow(RangeError);
  });

  it('refuses an empty cart', () => {
    expect(() => buildTransaction({ ...base, cart: EMPTY_CART, paid: 50000 })).toThrow(RangeError);
  });

  it('refuses a total above the database integer limit', () => {
    const cart = addProduct(EMPTY_CART, { id: 'p', name: 'Mahal', price: MAX_AMOUNT });
    const twice = increaseQuantity(cart, 'p');
    expect(() => buildTransaction({ ...base, cart: twice, paid: MAX_AMOUNT })).toThrow(RangeError);
  });

  it('refuses a paid amount above the database integer limit', () => {
    expect(() => buildTransaction({ ...base, cart: goldenCart(), paid: MAX_AMOUNT + 1 })).toThrow(RangeError);
  });
});

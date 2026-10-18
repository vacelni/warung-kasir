import { cartTotal, itemSubtotal, MAX_CART_LINES, type Cart } from './cart';
import { calculateChange, formatRupiah, type Money } from './money';
import { jakartaDateKey } from './time';

/** Largest value a PostgreSQL `integer` holds. The RPC rejects any amount above it (DATABASE D.9). */
export const MAX_AMOUNT: Money = 2_147_483_647;

/** Quick payment amounts (PRD §16, decision C20). Tapping one SETS the paid amount; Uang Pas is separate. */
export const QUICK_AMOUNTS: readonly Money[] = [10_000, 20_000, 50_000, 100_000, 200_000];

export type AmountInput =
  /** `amount` is null when the field is empty. */
  | { ok: true; amount: Money | null }
  /** Above MAX_AMOUNT: the keystroke is ignored and the previous value stays. */
  | { ok: false };

/**
 * Reads the paid-amount field. Only digits count, so "Rp50.000", "50000", and "50.000" are all
 * 50000 (the dot is the Indonesian thousands separator, never a decimal point).
 */
export function parseAmountInput(text: string): AmountInput {
  const digits = text.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (digits === '') return { ok: true, amount: null };
  if (digits.length > String(MAX_AMOUNT).length) return { ok: false };
  const amount = Number(digits);
  return amount > MAX_AMOUNT ? { ok: false } : { ok: true, amount };
}

/** Value shown in the paid-amount field: "Rp50.000", or empty before anything is entered. */
export function formatAmountInput(amount: Money | null): string {
  return amount === null ? '' : formatRupiah(amount);
}

export type PaymentCheck =
  /** Nothing entered yet: Bayar stays disabled, but no error is shown. */
  | { status: 'empty' }
  | { status: 'short'; shortfall: Money }
  | { status: 'ok'; change: Money };

/** Payment is valid only when paid ≥ total; change = paid − total (PRD §13.4, §17). */
export function checkPayment(total: Money, paid: Money | null): PaymentCheck {
  if (paid === null) return { status: 'empty' };
  const result = calculateChange(total, paid);
  return result.ok ? { status: 'ok', change: result.change } : { status: 'short', shortfall: result.shortfall };
}

/** "Uang pembayaran kurang Rp10.000" (PRD §17). */
export function shortfallMessage(shortfall: Money): string {
  return `Uang pembayaran kurang ${formatRupiah(shortfall)}`;
}

/** The transaction's real identity, created once when the payment screen opens (TECHNICAL_SPEC C.8). */
export function createCheckoutId(): string {
  return crypto.randomUUID();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Display code TRX-YYYYMMDD-XXXXXX: the Asia/Jakarta date of the sale and the first 6 hex
 * characters of the UUID, uppercase (decision D2). For people to read and search; not unique.
 */
export function transactionCode(id: string, createdAt: Date): string {
  if (!UUID.test(id)) throw new RangeError(`Transaction id must be a UUID, got "${id}".`);
  return `TRX-${jakartaDateKey(createdAt)}-${id.slice(0, 6).toUpperCase()}`;
}

/** One option chosen for a sold line, frozen at the moment of sale (DATABASE D.12). `price` is what it added. */
export type OptionSnapshot = {
  readonly group: string;
  readonly name: string;
  readonly price: Money;
};

/**
 * One sold line, frozen at the moment of sale. Field names match transaction_items (DATABASE D.7,
 * D.12). `unit_price` already includes the price of every option. `options` and `note` are absent
 * on sales saved on the device before options existed; read them as "no options, no note".
 */
export type TransactionItemSnapshot = {
  readonly product_id: string;
  readonly product_name: string;
  readonly unit_price: Money;
  readonly quantity: number;
  readonly subtotal: Money;
  readonly options?: readonly OptionSnapshot[];
  readonly note?: string | null;
};

/** The complete sale as stored in the outbox and sent to create_transaction (TECHNICAL_SPEC C.12). */
export type TransactionSnapshot = {
  readonly id: string;
  readonly code: string;
  readonly store_id: string;
  readonly cashier_id: string;
  /** Sale time (ISO 8601), preserved on every retry and on the server (decision D4). */
  readonly created_at: string;
  readonly items: readonly TransactionItemSnapshot[];
  readonly total: Money;
  readonly paid_amount: Money;
  readonly change_amount: Money;
};

type BuildTransactionInput = {
  id: string;
  createdAt: Date;
  cart: Cart;
  paid: Money;
  cashierId: string;
  storeId: string;
};

/**
 * Builds the immutable sale from the cart. Names and prices come from the cart snapshot, never
 * from a fresh catalog read (accepted risk D7). Throws when the sale is not valid, so an invalid
 * sale can never reach the outbox.
 */
export function buildTransaction({ id, createdAt, cart, paid, cashierId, storeId }: BuildTransactionInput): TransactionSnapshot {
  if (cart.length === 0) throw new RangeError('Cannot check out an empty cart.');
  if (cart.length > MAX_CART_LINES) throw new RangeError(`A sale has at most ${MAX_CART_LINES} different products.`);

  const items = cart.map((item) => ({
    product_id: item.productId,
    product_name: item.name,
    unit_price: item.unitPrice,
    quantity: item.quantity,
    subtotal: itemSubtotal(item),
    options: item.options.map((option) => ({ group: option.groupName, name: option.name, price: option.priceDelta })),
    note: item.note,
  }));
  const total = cartTotal(cart);
  for (const amount of [total, paid, ...items.map((item) => item.subtotal)]) {
    if (amount > MAX_AMOUNT) throw new RangeError(`Amount ${amount} is above the database limit.`);
  }

  const payment = checkPayment(total, paid);
  if (payment.status !== 'ok') throw new RangeError('Paid amount is less than the total.');

  return {
    id,
    code: transactionCode(id, createdAt),
    store_id: storeId,
    cashier_id: cashierId,
    created_at: createdAt.toISOString(),
    items,
    total,
    paid_amount: paid,
    change_amount: payment.change,
  };
}

/** Integer Indonesian Rupiah. Never a float, never a formatted string (CLAUDE.md, TECHNICAL_SPEC C.7). */
export type Money = number;

function assertRupiah(value: number, what: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${what} must be a whole number of Rupiah, got ${value}.`);
  }
}

/** subtotal = unit_price × quantity. Quantity is at least 1 (PRD §13.1); unit price is above 0 (PRD §13.2). */
export function calculateSubtotal(unitPrice: Money, quantity: number): Money {
  assertRupiah(unitPrice, 'Unit price');
  if (unitPrice <= 0) throw new RangeError(`Unit price must be above 0, got ${unitPrice}.`);
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new RangeError(`Quantity must be a whole number of at least 1, got ${quantity}.`);
  }
  const subtotal = unitPrice * quantity;
  assertRupiah(subtotal, 'Subtotal');
  return subtotal;
}

/** total = sum of all amounts. An empty list totals Rp0. */
export function sumMoney(amounts: readonly Money[]): Money {
  let total = 0;
  for (const amount of amounts) {
    assertRupiah(amount, 'Amount');
    total += amount;
  }
  assertRupiah(total, 'Total');
  return total;
}

export type ChangeResult =
  | { ok: true; change: Money }
  /** Paid less than the total; `shortfall` is how much is still missing. */
  | { ok: false; shortfall: Money };

/** change = paid_amount − total, valid only when paid_amount ≥ total (PRD §13.4). */
export function calculateChange(total: Money, paid: Money): ChangeResult {
  assertRupiah(total, 'Total');
  assertRupiah(paid, 'Paid amount');
  return paid >= total ? { ok: true, change: paid - total } : { ok: false, shortfall: total - paid };
}

/** Average transaction = Math.round(revenue / count); Rp0 when there are no transactions (PRD §21). */
export function averageTransaction(revenue: Money, transactionCount: number): Money {
  assertRupiah(revenue, 'Revenue');
  if (!Number.isSafeInteger(transactionCount) || transactionCount < 0) {
    throw new RangeError(`Transaction count must be a whole number of at least 0, got ${transactionCount}.`);
  }
  return transactionCount === 0 ? 0 : Math.round(revenue / transactionCount);
}

// The plain decimal style groups with dots and adds no currency symbol or space, so "Rp" is
// prepended by hand. (Intl's currency style would insert a space: TECHNICAL_SPEC C.7.)
const GROUPED_NUMBER = new Intl.NumberFormat('id-ID');

/** "Rp15.000": no space between Rp and the number. A negative amount reads "-Rp10.000". */
export function formatRupiah(amount: Money): string {
  assertRupiah(amount, 'Amount');
  return `${amount < 0 ? '-' : ''}Rp${GROUPED_NUMBER.format(Math.abs(amount))}`;
}

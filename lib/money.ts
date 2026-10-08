/** Integer Indonesian Rupiah. Never a float, never a formatted string (CLAUDE.md, TECHNICAL_SPEC C.7). */
export type Money = number;

/**
 * "Rp15.000": no space after "Rp" and a dot as the thousands separator. Written by hand
 * because Intl's currency style inserts a space (TECHNICAL_SPEC C.7).
 */
export function formatRupiah(amount: Money): string {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`Amount must be a whole number of Rupiah, got ${amount}.`);
  }
  const digits = String(Math.abs(amount)).replace(/\B(?=(\d{3})+$)/g, '.');
  return `${amount < 0 ? '-' : ''}Rp${digits}`;
}

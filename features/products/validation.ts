import type { Money } from '@/lib/money';

/** DATABASE D.5: price is a Postgres integer, above 0. */
export const MAX_PRICE: Money = 2_147_483_647;

export const PRODUCT_MESSAGES = {
  nameRequired: 'Nama menu wajib diisi.',
  categoryRequired: 'Pilih kategori.',
  priceRequired: 'Harga wajib diisi.',
  priceNotInteger: 'Harga harus berupa angka bulat, tanpa titik, koma, atau tanda minus.',
  priceNotPositive: 'Harga harus lebih dari Rp0.',
  priceTooLarge: 'Harga terlalu besar.',
} as const;

export type PriceResult = { ok: true; price: Money } | { ok: false; message: string };

/**
 * Reads the price field. Only plain digits are accepted, so "15.5", "1e3", "-5000" and
 * "15.000" are rejected instead of being guessed at; the value is never parsed as a float.
 */
export function parsePrice(raw: string): PriceResult {
  const text = raw.trim();
  if (text === '') return { ok: false, message: PRODUCT_MESSAGES.priceRequired };
  if (!/^[0-9]+$/.test(text)) return { ok: false, message: PRODUCT_MESSAGES.priceNotInteger };

  const price = Number(text);
  if (price > MAX_PRICE) return { ok: false, message: PRODUCT_MESSAGES.priceTooLarge };
  if (price === 0) return { ok: false, message: PRODUCT_MESSAGES.priceNotPositive };
  return { ok: true, price };
}

export type ProductFormValues = { name: string; categoryId: string; price: string };
export type ProductFormErrors = Partial<Record<keyof ProductFormValues, string>>;
/** What may be sent to the database: the three editable fields, price already an integer. */
export type ProductInput = { name: string; categoryId: string; price: Money };

export type ProductValidation = { ok: true; input: ProductInput } | { ok: false; errors: ProductFormErrors };

/** `categoryIds` are the categories the owner can pick; anything else is rejected. */
export function validateProductForm(values: ProductFormValues, categoryIds: readonly string[]): ProductValidation {
  const errors: ProductFormErrors = {};

  const name = values.name.trim();
  if (name === '') errors.name = PRODUCT_MESSAGES.nameRequired;

  if (!categoryIds.includes(values.categoryId)) errors.categoryId = PRODUCT_MESSAGES.categoryRequired;

  const price = parsePrice(values.price);
  if (!price.ok) errors.price = price.message;

  if (Object.keys(errors).length > 0 || !price.ok) return { ok: false, errors };
  return { ok: true, input: { name, categoryId: values.categoryId, price: price.price } };
}

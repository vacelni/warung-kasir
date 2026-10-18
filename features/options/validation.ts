import type { Money } from '@/lib/money';

/** DATABASE D.12: group and choice names are at most 60 characters. */
export const MAX_OPTION_NAME_LENGTH = 60;

/** A choice may add at most this much (a Postgres integer). Zero means free. */
export const MAX_PRICE_DELTA: Money = 2_147_483_647;

export const OPTION_MESSAGES = {
  nameRequired: 'Nama wajib diisi.',
  nameTooLong: `Nama paling banyak ${MAX_OPTION_NAME_LENGTH} karakter.`,
  priceNotInteger: 'Tambahan harga harus berupa angka bulat, tanpa titik, koma, atau tanda minus. Isi 0 jika gratis.',
  priceTooLarge: 'Tambahan harga terlalu besar.',
} as const;

export type NameResult = { ok: true; name: string } | { ok: false; message: string };

export function validateOptionName(raw: string): NameResult {
  const name = raw.trim();
  if (name === '') return { ok: false, message: OPTION_MESSAGES.nameRequired };
  if ([...name].length > MAX_OPTION_NAME_LENGTH) return { ok: false, message: OPTION_MESSAGES.nameTooLong };
  return { ok: true, name };
}

export type PriceDeltaResult = { ok: true; priceDelta: Money } | { ok: false; message: string };

/** The extra price of a choice. Empty means free (0); only plain digits are accepted. */
export function parsePriceDelta(raw: string): PriceDeltaResult {
  const text = raw.trim();
  if (text === '') return { ok: true, priceDelta: 0 };
  if (!/^[0-9]+$/.test(text)) return { ok: false, message: OPTION_MESSAGES.priceNotInteger };
  const priceDelta = Number(text);
  if (priceDelta > MAX_PRICE_DELTA) return { ok: false, message: OPTION_MESSAGES.priceTooLarge };
  return { ok: true, priceDelta };
}

/** The store profile fields the owner can edit (PRD §26, DATABASE D.2). Logo is post-MVP. */
export type StoreProfile = {
  name: string;
  address: string | null;
  phone: string | null;
  receiptNote: string | null;
};

export const SETTINGS_MESSAGES = {
  nameRequired: 'Nama warung wajib diisi.',
  phoneInvalid: 'Nomor telepon hanya boleh berisi angka, spasi, +, -, dan tanda kurung.',
} as const;

const PHONE = /^[0-9+\-()\s]+$/;

export type ProfileFormValues = { name: string; address: string; phone: string };
export type ProfileFormErrors = Partial<Record<keyof ProfileFormValues, string>>;
export type ProfileInput = Pick<StoreProfile, 'name' | 'address' | 'phone'>;

/** Empty optional fields are stored as null, not as an empty string. */
function optional(raw: string): string | null {
  const value = raw.trim();
  return value === '' ? null : value;
}

export function validateStoreProfile(
  values: ProfileFormValues,
): { ok: true; input: ProfileInput } | { ok: false; errors: ProfileFormErrors } {
  const errors: ProfileFormErrors = {};
  const name = values.name.trim();
  if (name === '') errors.name = SETTINGS_MESSAGES.nameRequired;
  const phone = optional(values.phone);
  if (phone !== null && !PHONE.test(phone)) errors.phone = SETTINGS_MESSAGES.phoneInvalid;
  if (errors.name || errors.phone) return { ok: false, errors };
  return { ok: true, input: { name, address: optional(values.address), phone } };
}

/** The receipt note is free text; blank clears it. Inner line breaks are kept. */
export function normalizeReceiptNote(raw: string): string | null {
  return optional(raw);
}

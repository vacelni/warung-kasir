/**
 * Form checks for cashier administration. UX only: the admin-cashier Edge Function validates the
 * same rules again and is the authority (supabase/functions/admin-cashier/handler.ts).
 */

/** Supabase Auth minimum (config.toml minimum_password_length). */
export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt reads at most 72 bytes; Auth rejects longer passwords. */
export const PASSWORD_MAX_BYTES = 72;

export const EMPLOYEE_MESSAGES = {
  nameRequired: 'Nama wajib diisi.',
  emailRequired: 'Email login wajib diisi.',
  emailInvalid: 'Format email tidak valid.',
  passwordRequired: 'Password wajib diisi.',
  passwordTooShort: `Password minimal ${PASSWORD_MIN_LENGTH} karakter.`,
  passwordTooLong: 'Password terlalu panjang.',
  passwordBlank: 'Password tidak boleh hanya berisi spasi.',
} as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function nameError(raw: string): string | undefined {
  return raw.trim() === '' ? EMPLOYEE_MESSAGES.nameRequired : undefined;
}

export function emailError(raw: string): string | undefined {
  const email = raw.trim();
  if (email === '') return EMPLOYEE_MESSAGES.emailRequired;
  return EMAIL.test(email) ? undefined : EMPLOYEE_MESSAGES.emailInvalid;
}

/** The password is used exactly as typed (no trimming), like the login form. */
export function passwordError(password: string): string | undefined {
  if (password === '') return EMPLOYEE_MESSAGES.passwordRequired;
  if (password.length < PASSWORD_MIN_LENGTH) return EMPLOYEE_MESSAGES.passwordTooShort;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return EMPLOYEE_MESSAGES.passwordTooLong;
  if (password.trim() === '') return EMPLOYEE_MESSAGES.passwordBlank;
  return undefined;
}

export type CashierFormValues = { name: string; email: string; password: string };
export type CashierFormErrors = Partial<Record<keyof CashierFormValues, string>>;
/** What is sent to the Edge Function: name trimmed, email trimmed and lowercased. */
export type NewCashier = CashierFormValues;

export type CashierValidation = { ok: true; input: NewCashier } | { ok: false; errors: CashierFormErrors };

export function validateNewCashier(values: CashierFormValues): CashierValidation {
  const errors: CashierFormErrors = {
    name: nameError(values.name),
    email: emailError(values.email),
    password: passwordError(values.password),
  };
  if (errors.name || errors.email || errors.password) return { ok: false, errors };
  return {
    ok: true,
    input: { name: values.name.trim(), email: values.email.trim().toLowerCase(), password: values.password },
  };
}

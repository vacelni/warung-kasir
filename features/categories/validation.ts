export const CATEGORY_NAME_REQUIRED = 'Nama kategori wajib diisi.';

export type CategoryNameResult = { ok: true; name: string } | { ok: false; message: string };

/** The stored name is trimmed; the database also rejects a blank name (DATABASE D.4). */
export function validateCategoryName(raw: string): CategoryNameResult {
  const name = raw.trim();
  return name === '' ? { ok: false, message: CATEGORY_NAME_REQUIRED } : { ok: true, name };
}

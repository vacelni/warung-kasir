import { describe, expect, it } from 'vitest';
import { CATEGORY_NAME_REQUIRED, validateCategoryName } from './validation';

describe('validateCategoryName (PRD §24, DATABASE D.4)', () => {
  it('returns the trimmed name', () => {
    expect(validateCategoryName('  Minuman ')).toEqual({ ok: true, name: 'Minuman' });
  });

  it('refuses an empty or blank name', () => {
    expect(validateCategoryName('')).toEqual({ ok: false, message: CATEGORY_NAME_REQUIRED });
    expect(validateCategoryName(' \t\n ')).toEqual({ ok: false, message: CATEGORY_NAME_REQUIRED });
  });

  it('keeps inner spaces and letters as typed', () => {
    expect(validateCategoryName('Paket Hemat')).toEqual({ ok: true, name: 'Paket Hemat' });
  });
});

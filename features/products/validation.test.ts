import { describe, expect, it } from 'vitest';
import { MAX_NAME_LENGTH, MAX_PRICE, parsePrice, PRODUCT_MESSAGES, validateProductForm } from './validation';

describe('parsePrice', () => {
  it.each([
    ['15000', 15000],
    ['1', 1],
    [' 5000 ', 5000],
    ['007', 7],
    [String(MAX_PRICE), MAX_PRICE],
  ])('accepts the whole number %j', (raw, expected) => {
    expect(parsePrice(raw)).toEqual({ ok: true, price: expected });
  });

  it('rejects an empty price', () => {
    expect(parsePrice('')).toEqual({ ok: false, message: PRODUCT_MESSAGES.priceRequired });
    expect(parsePrice('   ')).toEqual({ ok: false, message: PRODUCT_MESSAGES.priceRequired });
  });

  it.each(['0', '00', '000'])('rejects zero (%j)', (raw) => {
    expect(parsePrice(raw)).toEqual({ ok: false, message: PRODUCT_MESSAGES.priceNotPositive });
  });

  it.each(['-1', '-5000', '-0'])('rejects the negative value %j', (raw) => {
    expect(parsePrice(raw)).toEqual({ ok: false, message: PRODUCT_MESSAGES.priceNotInteger });
  });

  it.each(['15000.5', '15.5', '15,5', '15.000', '1e3', '0x10', '15 000', 'abc', 'Rp15000', '１５０００'])(
    'rejects the non-integer %j',
    (raw) => {
      expect(parsePrice(raw)).toEqual({ ok: false, message: PRODUCT_MESSAGES.priceNotInteger });
    },
  );

  it('rejects a price above the database integer limit', () => {
    expect(parsePrice(String(MAX_PRICE + 1))).toEqual({ ok: false, message: PRODUCT_MESSAGES.priceTooLarge });
    expect(parsePrice('99999999999999999999999')).toEqual({ ok: false, message: PRODUCT_MESSAGES.priceTooLarge });
  });
});

describe('validateProductForm', () => {
  const categories = ['makanan', 'minuman'];

  it('returns the trimmed name and an integer price', () => {
    const result = validateProductForm({ name: '  Nasi Goreng ', categoryId: 'makanan', price: '15000' }, categories);
    expect(result).toEqual({ ok: true, input: { name: 'Nasi Goreng', categoryId: 'makanan', price: 15000 } });
  });

  it('reports every invalid field at once', () => {
    const result = validateProductForm({ name: '  ', categoryId: '', price: '0' }, categories);
    expect(result).toEqual({
      ok: false,
      errors: {
        name: PRODUCT_MESSAGES.nameRequired,
        categoryId: PRODUCT_MESSAGES.categoryRequired,
        price: PRODUCT_MESSAGES.priceNotPositive,
      },
    });
  });

  it('rejects a category that is not one of the choices', () => {
    const result = validateProductForm({ name: 'Es Teh', categoryId: 'other-store', price: '5000' }, categories);
    expect(result).toEqual({ ok: false, errors: { categoryId: PRODUCT_MESSAGES.categoryRequired } });
  });

  it('rejects a fractional price even when everything else is valid', () => {
    const result = validateProductForm({ name: 'Es Teh', categoryId: 'minuman', price: '5000.50' }, categories);
    expect(result).toEqual({ ok: false, errors: { price: PRODUCT_MESSAGES.priceNotInteger } });
  });
});

describe('product name length (SEC-07, DATABASE D.5)', () => {
  const categories = ['makanan'];
  const validate = (name: string) => validateProductForm({ name, categoryId: 'makanan', price: '1000' }, categories);

  it('accepts 120 characters (after trimming), counting each character once', () => {
    expect(MAX_NAME_LENGTH).toBe(120);
    expect(validate(` ${'a'.repeat(120)} `).ok).toBe(true);
    expect(validate('🍜'.repeat(120)).ok).toBe(true);
  });

  it('refuses 121 characters', () => {
    expect(validate('a'.repeat(121))).toEqual({ ok: false, errors: { name: PRODUCT_MESSAGES.nameTooLong } });
  });
});

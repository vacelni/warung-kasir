import { describe, expect, it } from 'vitest';
import { catalogGroupsFor, sortChoices, type OptionChoice, type OptionGroup, type ProductGroupLink } from './model';
import { MAX_OPTION_NAME_LENGTH, MAX_PRICE_DELTA, parsePriceDelta, validateOptionName } from './validation';

const choice = (id: string, groupId: string, overrides: Partial<OptionChoice> = {}): OptionChoice => ({
  id,
  groupId,
  name: id,
  priceDelta: 0,
  isDefault: false,
  isActive: true,
  position: 0,
  ...overrides,
});

const LEVEL: OptionGroup = {
  id: 'g-level',
  name: 'Level',
  allowMultiple: false,
  required: true,
  choices: [choice('l1', 'g-level', { isDefault: true }), choice('l5', 'g-level', { position: 1 })],
};
const NASI: OptionGroup = {
  id: 'g-nasi',
  name: 'Nasi',
  allowMultiple: false,
  required: false,
  choices: [choice('nasi', 'g-nasi', { priceDelta: 4000 })],
};

describe('catalogGroupsFor', () => {
  const links: ProductGroupLink[] = [
    { productId: 'geprek', groupId: 'g-level', position: 1 },
    { productId: 'geprek', groupId: 'g-nasi', position: 0 },
    { productId: 'bakar', groupId: 'g-level', position: 0 },
  ];

  it('returns the product’s groups in the owner’s order, with the price and default of each choice', () => {
    expect(catalogGroupsFor('geprek', [LEVEL, NASI], links)).toEqual([
      {
        id: 'g-nasi',
        name: 'Nasi',
        allowMultiple: false,
        required: false,
        choices: [{ id: 'nasi', name: 'nasi', priceDelta: 4000, isDefault: false }],
      },
      {
        id: 'g-level',
        name: 'Level',
        allowMultiple: false,
        required: true,
        choices: [
          { id: 'l1', name: 'l1', priceDelta: 0, isDefault: true },
          { id: 'l5', name: 'l5', priceDelta: 0, isDefault: false },
        ],
      },
    ]);
  });

  it('gives a product with no links no groups', () => {
    expect(catalogGroupsFor('es-teh', [LEVEL, NASI], links)).toEqual([]);
  });

  it('hides choices marked sold out', () => {
    const soldOut: OptionGroup = { ...LEVEL, choices: [choice('l1', 'g-level', { isActive: false }), choice('l5', 'g-level')] };
    const [group] = catalogGroupsFor('bakar', [soldOut], links);
    expect(group?.choices.map((c) => c.id)).toEqual(['l5']);
  });

  it('keeps a required group with nothing left to sell, so the cashier is told it is sold out', () => {
    const empty: OptionGroup = { ...LEVEL, choices: [choice('l1', 'g-level', { isActive: false })] };
    expect(catalogGroupsFor('bakar', [empty], links)).toEqual([
      { id: 'g-level', name: 'Level', allowMultiple: false, required: true, choices: [] },
    ]);
  });

  it('drops an optional group with nothing left to sell, and a link to a group that no longer exists', () => {
    const empty: OptionGroup = { ...NASI, choices: [choice('nasi', 'g-nasi', { isActive: false })] };
    expect(catalogGroupsFor('geprek', [empty], links)).toEqual([]);
  });
});

describe('sortChoices', () => {
  it('orders by position, then by creation time, without changing its input', () => {
    const input = [
      { id: 'c', position: 1, createdAt: '2026-10-18T01:00:01Z' },
      { id: 'b', position: 0, createdAt: '2026-10-18T01:00:02Z' },
      { id: 'a', position: 0, createdAt: '2026-10-18T01:00:01Z' },
    ];
    expect(sortChoices(input).map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(input[0]?.id).toBe('c');
  });
});

describe('validateOptionName', () => {
  it('trims the name and refuses a blank or over-long one (DATABASE D.12)', () => {
    expect(validateOptionName('  Level 3 ')).toEqual({ ok: true, name: 'Level 3' });
    expect(validateOptionName('   ')).toMatchObject({ ok: false });
    expect(validateOptionName('x'.repeat(MAX_OPTION_NAME_LENGTH))).toMatchObject({ ok: true });
    expect(validateOptionName('x'.repeat(MAX_OPTION_NAME_LENGTH + 1))).toMatchObject({ ok: false });
  });
});

describe('parsePriceDelta', () => {
  it('reads plain digits, and treats an empty field as free', () => {
    expect(parsePriceDelta('4000')).toEqual({ ok: true, priceDelta: 4000 });
    expect(parsePriceDelta('0')).toEqual({ ok: true, priceDelta: 0 });
    expect(parsePriceDelta('  ')).toEqual({ ok: true, priceDelta: 0 });
  });

  it.each(['-500', '1.5', '4.000', '1e3', 'Rp4000', '4 000'])('refuses %s instead of guessing', (text) => {
    expect(parsePriceDelta(text)).toMatchObject({ ok: false });
  });

  it('refuses an amount a Postgres integer cannot hold', () => {
    expect(parsePriceDelta(String(MAX_PRICE_DELTA))).toMatchObject({ ok: true });
    expect(parsePriceDelta(String(MAX_PRICE_DELTA + 1))).toMatchObject({ ok: false });
  });
});

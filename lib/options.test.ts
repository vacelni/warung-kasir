import { describe, expect, it } from 'vitest';
import {
  initialSelection,
  missingRequired,
  priceAddition,
  selectedOptions,
  summarizeOptions,
  toggleChoice,
  unavailableRequired,
  type CatalogOptionGroup,
} from './options';

const choice = (id: string, name: string, priceDelta = 0, isDefault = false) => ({ id, name, priceDelta, isDefault });

const LEVEL: CatalogOptionGroup = {
  id: 'g-level',
  name: 'Level',
  allowMultiple: false,
  required: true,
  choices: [choice('l1', 'Level 1'), choice('l3', 'Level 3'), choice('l5', 'Level 5')],
};
const NASI: CatalogOptionGroup = {
  id: 'g-nasi',
  name: 'Nasi',
  allowMultiple: false,
  required: false,
  choices: [choice('nasi', 'Pakai nasi', 4000)],
};
const BAGIAN: CatalogOptionGroup = {
  id: 'g-bagian',
  name: 'Bagian ayam',
  allowMultiple: false,
  required: true,
  choices: [choice('dada', 'Dada', 3000, true), choice('paha', 'Paha', 1000), choice('sayap', 'Sayap')],
};
const EXTRA: CatalogOptionGroup = {
  id: 'g-extra',
  name: 'Tambahan',
  allowMultiple: true,
  required: false,
  choices: [choice('telur', 'Telur', 3000), choice('tempe', 'Tempe', 2000), choice('kol', 'Kol goreng', 0, true)],
};
const GROUPS = [NASI, LEVEL, BAGIAN, EXTRA];

describe('initialSelection', () => {
  it('pre-selects the choices the owner marked as default', () => {
    expect(initialSelection(GROUPS)).toEqual({ 'g-bagian': ['dada'], 'g-extra': ['kol'] });
  });

  it('keeps only one default in a pick-one group', () => {
    const twoDefaults: CatalogOptionGroup = { ...LEVEL, choices: [choice('a', 'A', 0, true), choice('b', 'B', 0, true)] };
    expect(initialSelection([twoDefaults])).toEqual({ 'g-level': ['a'] });
  });

  it('selects nothing when no group has a default', () => {
    expect(initialSelection([LEVEL, NASI])).toEqual({});
  });
});

describe('toggleChoice', () => {
  it('replaces the choice in a pick-one group', () => {
    let selection = toggleChoice(GROUPS, {}, 'g-level', 'l3');
    selection = toggleChoice(GROUPS, selection, 'g-level', 'l5');
    expect(selection['g-level']).toEqual(['l5']);
  });

  it('does not clear a required pick-one group by tapping the chosen choice again', () => {
    const selection = toggleChoice(GROUPS, { 'g-level': ['l3'] }, 'g-level', 'l3');
    expect(selection['g-level']).toEqual(['l3']);
  });

  it('clears an optional pick-one group by tapping the chosen choice again ("tanpa nasi")', () => {
    let selection = toggleChoice(GROUPS, {}, 'g-nasi', 'nasi');
    expect(selection['g-nasi']).toEqual(['nasi']);
    selection = toggleChoice(GROUPS, selection, 'g-nasi', 'nasi');
    expect(selection['g-nasi']).toEqual([]);
  });

  it('toggles each choice of a pick-many group independently', () => {
    let selection = toggleChoice(GROUPS, {}, 'g-extra', 'telur');
    selection = toggleChoice(GROUPS, selection, 'g-extra', 'tempe');
    expect(selection['g-extra']).toEqual(['telur', 'tempe']);
    selection = toggleChoice(GROUPS, selection, 'g-extra', 'telur');
    expect(selection['g-extra']).toEqual(['tempe']);
  });

  it('ignores a group or choice it does not know, and does not mutate the previous selection', () => {
    const before = { 'g-level': ['l1'] };
    expect(toggleChoice(GROUPS, before, 'nope', 'l3')).toBe(before);
    expect(toggleChoice(GROUPS, before, 'g-level', 'nope')).toBe(before);
    toggleChoice(GROUPS, before, 'g-level', 'l5');
    expect(before).toEqual({ 'g-level': ['l1'] });
  });
});

describe('missingRequired', () => {
  it('lists required groups with nothing chosen, in group order', () => {
    expect(missingRequired(GROUPS, {}).map((group) => group.name)).toEqual(['Level', 'Bagian ayam']);
  });

  it('is empty once every required group has a choice, optional groups may stay empty', () => {
    expect(missingRequired(GROUPS, { 'g-level': ['l3'], 'g-bagian': ['paha'] })).toEqual([]);
  });

  it('treats an emptied group as missing', () => {
    expect(missingRequired([LEVEL], { 'g-level': [] }).map((group) => group.name)).toEqual(['Level']);
  });
});

describe('unavailableRequired', () => {
  it('finds a required group whose choices are all sold out', () => {
    const soldOut: CatalogOptionGroup = { ...BAGIAN, choices: [] };
    expect(unavailableRequired([LEVEL, soldOut]).map((group) => group.name)).toEqual(['Bagian ayam']);
    expect(unavailableRequired([LEVEL, { ...NASI, choices: [] }])).toEqual([]);
  });
});

describe('selectedOptions', () => {
  it('returns cart options in the order of the groups and choices, not the order of tapping', () => {
    const selection = { 'g-extra': ['tempe', 'telur'], 'g-bagian': ['paha'], 'g-level': ['l5'], 'g-nasi': ['nasi'] };
    expect(selectedOptions(GROUPS, selection).map((option) => option.name)).toEqual([
      'Pakai nasi',
      'Level 5',
      'Paha',
      'Telur',
      'Tempe',
    ]);
  });

  it('carries the group name and the price each choice adds', () => {
    expect(selectedOptions(GROUPS, { 'g-bagian': ['dada'] })).toEqual([
      { groupId: 'g-bagian', groupName: 'Bagian ayam', choiceId: 'dada', name: 'Dada', priceDelta: 3000 },
    ]);
  });

  it('ignores ids that are no longer in the group (a choice hidden after the sheet opened)', () => {
    expect(selectedOptions(GROUPS, { 'g-level': ['gone'] })).toEqual([]);
  });
});

describe('summarizeOptions and priceAddition', () => {
  it('joins the names with a middle dot', () => {
    expect(summarizeOptions([{ name: 'Pakai nasi' }, { name: 'Level 3' }, { name: 'Dada' }])).toBe('Pakai nasi · Level 3 · Dada');
    expect(summarizeOptions([])).toBe('');
    expect(summarizeOptions([{ name: 'Level 3' }, { name: 'Dada' }], ', ')).toBe('Level 3, Dada');
  });

  it('reports a price addition only when the choice is not free', () => {
    expect(priceAddition({ priceDelta: 4000 })).toBe(4000);
    expect(priceAddition({ priceDelta: 0 })).toBeNull();
  });
});

import type { CartOption } from './cart';
import type { Money } from './money';

/**
 * Product options as the cashier sees them (DATABASE D.12). Owners define reusable groups
 * ("Level", "Bagian ayam", "Nasi") with choices that may add to the price, and attach groups to
 * products. This file holds the types the cashier screen and the offline copy share, and the pure
 * rules for picking choices; it does no I/O.
 */

/** One tappable choice. Only active choices reach the cashier: an owner hides a sold-out one. */
export type CatalogChoice = {
  id: string;
  name: string;
  /** What the choice adds to the unit price; 0 when free. */
  priceDelta: Money;
  /** Selected automatically when the sheet opens. */
  isDefault: boolean;
};

export type CatalogOptionGroup = {
  id: string;
  name: string;
  /** false = pick one; true = any number (extras such as "Tambah telur"). */
  allowMultiple: boolean;
  /** true = the cashier must pick before the line can be added. */
  required: boolean;
  /** In the order the owner arranged them. */
  choices: readonly CatalogChoice[];
};

/** Chosen choice ids per group id. A group with nothing chosen has no entry or an empty list. */
export type Selection = Readonly<Record<string, readonly string[]>>;

/** Starts from the owner's defaults: every choice marked default, one per single-choice group. */
export function initialSelection(groups: readonly CatalogOptionGroup[]): Selection {
  const selection: Record<string, readonly string[]> = {};
  for (const group of groups) {
    const defaults = group.choices.filter((choice) => choice.isDefault).map((choice) => choice.id);
    if (defaults.length === 0) continue;
    selection[group.id] = group.allowMultiple ? defaults : defaults.slice(0, 1);
  }
  return selection;
}

/**
 * One tap on a choice. Pick-one groups behave like radio buttons (a required one cannot be
 * cleared, an optional one can be tapped again to clear); pick-many groups toggle.
 */
export function toggleChoice(
  groups: readonly CatalogOptionGroup[],
  selection: Selection,
  groupId: string,
  choiceId: string,
): Selection {
  const group = groups.find((candidate) => candidate.id === groupId);
  if (!group || !group.choices.some((choice) => choice.id === choiceId)) return selection;

  const current = selection[groupId] ?? [];
  const chosen = current.includes(choiceId);
  let next: readonly string[];
  if (group.allowMultiple) {
    next = chosen ? current.filter((id) => id !== choiceId) : [...current, choiceId];
  } else if (chosen) {
    next = group.required ? current : [];
  } else {
    next = [choiceId];
  }
  return { ...selection, [groupId]: next };
}

/** Required groups with nothing chosen. The line cannot be added while this is not empty. */
export function missingRequired(groups: readonly CatalogOptionGroup[], selection: Selection): CatalogOptionGroup[] {
  return groups.filter((group) => group.required && (selection[group.id]?.length ?? 0) === 0);
}

/** Required groups that cannot be satisfied because every choice is hidden (sold out). */
export function unavailableRequired(groups: readonly CatalogOptionGroup[]): CatalogOptionGroup[] {
  return groups.filter((group) => group.required && group.choices.length === 0);
}

/**
 * The chosen options as cart options, in the order of the groups and of the choices inside them
 * (not the order of tapping), so the same choices always print and read the same.
 */
export function selectedOptions(groups: readonly CatalogOptionGroup[], selection: Selection): CartOption[] {
  const options: CartOption[] = [];
  for (const group of groups) {
    const chosen = selection[group.id] ?? [];
    for (const choice of group.choices) {
      if (!chosen.includes(choice.id)) continue;
      options.push({
        groupId: group.id,
        groupName: group.name,
        choiceId: choice.id,
        name: choice.name,
        priceDelta: choice.priceDelta,
      });
    }
  }
  return options;
}

/**
 * "Pakai nasi · Level 3 · Dada": the choices on one line, for the order, history, and receipt on
 * screen. A thermal printer has no middle dot, so the printed receipt passes ', ' instead.
 */
export function summarizeOptions(options: readonly { name: string }[], separator = ' · '): string {
  return options.map((option) => option.name).join(separator);
}

/** "+Rp4.000" label helper input: the price a choice adds, or null when it is free. */
export function priceAddition(choice: Pick<CatalogChoice, 'priceDelta'>): Money | null {
  return choice.priceDelta > 0 ? choice.priceDelta : null;
}

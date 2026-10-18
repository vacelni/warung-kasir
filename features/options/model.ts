import type { Money } from '@/lib/money';
import type { CatalogOptionGroup } from '@/lib/options';

/** A choice as the owner manages it: inactive ("habis") choices are included. */
export type OptionChoice = {
  id: string;
  groupId: string;
  name: string;
  priceDelta: Money;
  isDefault: boolean;
  isActive: boolean;
  position: number;
};

export type OptionGroup = {
  id: string;
  name: string;
  allowMultiple: boolean;
  required: boolean;
  /** In display order: position, then creation time. */
  choices: OptionChoice[];
};

/** A group attached to a product. `position` is the order the cashier sees the groups in. */
export type ProductGroupLink = { productId: string; groupId: string; position: number };

/**
 * The groups the cashier sees for one product, in the owner's order, with only the choices that
 * can be sold. A required group with no sellable choice is kept so the cashier screen can say it
 * is sold out; an optional one with none is dropped (nothing to choose).
 */
export function catalogGroupsFor(
  productId: string,
  groups: readonly OptionGroup[],
  links: readonly ProductGroupLink[],
): CatalogOptionGroup[] {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const result: CatalogOptionGroup[] = [];
  const linked = links.filter((link) => link.productId === productId).sort((a, b) => a.position - b.position);
  for (const link of linked) {
    const group = byId.get(link.groupId);
    if (!group) continue;
    const choices = group.choices
      .filter((choice) => choice.isActive)
      .map((choice) => ({ id: choice.id, name: choice.name, priceDelta: choice.priceDelta, isDefault: choice.isDefault }));
    if (choices.length === 0 && !group.required) continue;
    result.push({ id: group.id, name: group.name, allowMultiple: group.allowMultiple, required: group.required, choices });
  }
  return result;
}

/** Orders choices the way they are shown: by position, then by creation time (ISO text sorts correctly). */
export function sortChoices<T extends { position: number; createdAt?: string }>(choices: T[]): T[] {
  return [...choices].sort((a, b) => a.position - b.position || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
}

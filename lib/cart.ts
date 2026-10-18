import { calculateSubtotal, sumMoney, type Money } from './money';

/**
 * One choice the cashier tapped for a product (DATABASE D.12): "Level 3" from the group "Level",
 * "Dada" from "Bagian ayam". `priceDelta` is what it adds to the unit price (0 when free).
 */
export type CartOption = {
  groupId: string;
  groupName: string;
  choiceId: string;
  name: string;
  priceDelta: Money;
};

/**
 * What the cart needs to know about a product. `price` is the product's own price at the moment it
 * is added; the chosen options add to it. `note` is free text for the kitchen.
 */
export type CartProduct = {
  id: string;
  name: string;
  price: Money;
  options?: readonly CartOption[];
  note?: string | null;
};

/**
 * A cart line. Name, options, and unit price are a snapshot, so a catalog refresh never changes an
 * open order. `lineId` tells lines apart: a plain product's line id is its product id; with options
 * or a note it also carries them, so "Geprek level 3" and "Geprek level 5" are two lines while the
 * same choices tapped twice are one line with quantity 2.
 */
export type CartItem = {
  lineId: string;
  productId: string;
  name: string;
  /** Product price plus the price of every chosen option, for one unit. */
  unitPrice: Money;
  quantity: number;
  options: readonly CartOption[];
  note: string | null;
};

/** Lines in the order they were first added. Every function below returns a new cart. */
export type Cart = readonly CartItem[];

export const EMPTY_CART: Cart = [];

/** At most this many different lines in one sale (DATABASE D.9, SEC-07). */
export const MAX_CART_LINES = 200;

/** At most this many chosen options on one line, and this long a note (DATABASE D.12). */
export const MAX_OPTIONS_PER_LINE = 20;
export const MAX_NOTE_LENGTH = 120;

/** A note with surrounding space removed; null when nothing is left. */
export function normalizeNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/** The identity of a line: the product, the chosen options (in any order), and the note. */
export function lineIdFor(productId: string, options: readonly CartOption[] = [], note?: string | null): string {
  const choices = options
    .map((option) => option.choiceId)
    .sort()
    .join(',');
  const text = normalizeNote(note);
  return choices === '' && text === null ? productId : `${productId}|${choices}|${text ?? ''}`;
}

/** Whether one more unit of this line fits in the cart: a line already in it always does. */
export function canAddLine(cart: Cart, lineId: string): boolean {
  return cart.length < MAX_CART_LINES || cart.some((item) => item.lineId === lineId);
}

function updateItem(cart: Cart, lineId: string, update: (item: CartItem) => CartItem): Cart {
  if (!cart.some((item) => item.lineId === lineId)) return cart;
  return cart.map((item) => (item.lineId === lineId ? update(item) : item));
}

/** Price of one unit: the product's price plus what every chosen option adds. */
export function unitPriceOf(price: Money, options: readonly CartOption[] = []): Money {
  return sumMoney([price, ...options.map((option) => option.priceDelta)]);
}

/** Adds `quantity` units (default 1). A line already in the cart gains quantity instead of a second line. */
export function addProduct(cart: Cart, product: CartProduct, quantity = 1): Cart {
  if (!Number.isInteger(quantity) || quantity < 1) throw new RangeError('Quantity must be a whole number of at least 1.');
  const options = product.options ?? [];
  const note = normalizeNote(product.note);
  if (options.length > MAX_OPTIONS_PER_LINE) throw new RangeError(`A line has at most ${MAX_OPTIONS_PER_LINE} options.`);
  if (note !== null && note.length > MAX_NOTE_LENGTH) throw new RangeError(`A note has at most ${MAX_NOTE_LENGTH} characters.`);

  const lineId = lineIdFor(product.id, options, note);
  if (cart.some((item) => item.lineId === lineId)) {
    return updateItem(cart, lineId, (item) => ({ ...item, quantity: item.quantity + quantity }));
  }
  if (!canAddLine(cart, lineId)) return cart;
  const unitPrice = unitPriceOf(product.price, options);
  // Validates the price before the line exists.
  calculateSubtotal(unitPrice, 1);
  return [...cart, { lineId, productId: product.id, name: product.name, unitPrice, quantity, options: [...options], note }];
}

export function increaseQuantity(cart: Cart, lineId: string): Cart {
  return updateItem(cart, lineId, (item) => ({ ...item, quantity: item.quantity + 1 }));
}

/** Quantity never goes below 1 (PRD §13.1); taking a line out is `removeProduct`. */
export function decreaseQuantity(cart: Cart, lineId: string): Cart {
  const item = cart.find((line) => line.lineId === lineId);
  if (!item || item.quantity <= 1) return cart;
  return updateItem(cart, lineId, (line) => ({ ...line, quantity: line.quantity - 1 }));
}

export function removeProduct(cart: Cart, lineId: string): Cart {
  return cart.some((item) => item.lineId === lineId) ? cart.filter((item) => item.lineId !== lineId) : cart;
}

export function clearCart(): Cart {
  return EMPTY_CART;
}

export function itemSubtotal(item: CartItem): Money {
  return calculateSubtotal(item.unitPrice, item.quantity);
}

/** total = sum of all subtotals. */
export function cartTotal(cart: Cart): Money {
  return sumMoney(cart.map(itemSubtotal));
}

/** Total units in the cart (Nasi Goreng ×2 + Es Teh ×1 = 3). */
export function cartItemCount(cart: Cart): number {
  return cart.reduce((count, item) => count + item.quantity, 0);
}

/** Units of one product in the cart across all its lines (Geprek level 3 ×2 + Geprek level 5 ×1 = 3); 0 when absent. */
export function quantityOf(cart: Cart, productId: string): number {
  return cart.reduce((count, item) => (item.productId === productId ? count + item.quantity : count), 0);
}

export type CartAction =
  | { type: 'add'; product: CartProduct; quantity?: number }
  | { type: 'increase'; lineId: string }
  | { type: 'decrease'; lineId: string }
  | { type: 'remove'; lineId: string }
  | { type: 'clear' };

/** Pure reducer for the cart. The React provider only wires it to `useReducer`; it never does I/O. */
export function cartReducer(cart: Cart, action: CartAction): Cart {
  switch (action.type) {
    case 'add':
      return addProduct(cart, action.product, action.quantity);
    case 'increase':
      return increaseQuantity(cart, action.lineId);
    case 'decrease':
      return decreaseQuantity(cart, action.lineId);
    case 'remove':
      return removeProduct(cart, action.lineId);
    case 'clear':
      return clearCart();
  }
}

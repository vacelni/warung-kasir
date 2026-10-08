import { calculateSubtotal, sumMoney, type Money } from './money';

/** What the cart needs to know about a product. `price` is the price at the moment it is added. */
export type CartProduct = { id: string; name: string; price: Money };

/** A cart line. Name and unit price are a snapshot, so a catalog refresh never changes an open order. */
export type CartItem = {
  productId: string;
  name: string;
  unitPrice: Money;
  quantity: number;
};

/** Lines in the order they were first added. Every function below returns a new cart. */
export type Cart = readonly CartItem[];

export const EMPTY_CART: Cart = [];

function updateItem(cart: Cart, productId: string, update: (item: CartItem) => CartItem): Cart {
  if (!cart.some((item) => item.productId === productId)) return cart;
  return cart.map((item) => (item.productId === productId ? update(item) : item));
}

/** Adds one unit. A product already in the cart gains quantity instead of a second line. */
export function addProduct(cart: Cart, product: CartProduct): Cart {
  if (cart.some((item) => item.productId === product.id)) {
    return increaseQuantity(cart, product.id);
  }
  // Validates the price before the line exists.
  calculateSubtotal(product.price, 1);
  return [...cart, { productId: product.id, name: product.name, unitPrice: product.price, quantity: 1 }];
}

export function increaseQuantity(cart: Cart, productId: string): Cart {
  return updateItem(cart, productId, (item) => ({ ...item, quantity: item.quantity + 1 }));
}

/** Quantity never goes below 1 (PRD §13.1); taking a line out is `removeProduct`. */
export function decreaseQuantity(cart: Cart, productId: string): Cart {
  const item = cart.find((line) => line.productId === productId);
  if (!item || item.quantity <= 1) return cart;
  return updateItem(cart, productId, (line) => ({ ...line, quantity: line.quantity - 1 }));
}

export function removeProduct(cart: Cart, productId: string): Cart {
  return cart.some((item) => item.productId === productId)
    ? cart.filter((item) => item.productId !== productId)
    : cart;
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

/** Quantity of one product in the cart, 0 when absent. */
export function quantityOf(cart: Cart, productId: string): number {
  return cart.find((item) => item.productId === productId)?.quantity ?? 0;
}

export type CartAction =
  | { type: 'add'; product: CartProduct }
  | { type: 'increase'; productId: string }
  | { type: 'decrease'; productId: string }
  | { type: 'remove'; productId: string }
  | { type: 'clear' };

/** Pure reducer for the cart. The React provider only wires it to `useReducer`; it never does I/O. */
export function cartReducer(cart: Cart, action: CartAction): Cart {
  switch (action.type) {
    case 'add':
      return addProduct(cart, action.product);
    case 'increase':
      return increaseQuantity(cart, action.productId);
    case 'decrease':
      return decreaseQuantity(cart, action.productId);
    case 'remove':
      return removeProduct(cart, action.productId);
    case 'clear':
      return clearCart();
  }
}

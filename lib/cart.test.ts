import { describe, expect, it } from 'vitest';
import {
  addProduct,
  canAddProduct,
  cartItemCount,
  cartReducer,
  cartTotal,
  clearCart,
  decreaseQuantity,
  EMPTY_CART,
  increaseQuantity,
  itemSubtotal,
  MAX_CART_LINES,
  quantityOf,
  removeProduct,
  type Cart,
  type CartAction,
  type CartProduct,
} from './cart';

const NASI_GORENG: CartProduct = { id: 'p-nasi', name: 'Nasi Goreng', price: 15000 };
const ES_TEH: CartProduct = { id: 'p-teh', name: 'Es Teh', price: 5000 };
const AYAM: CartProduct = { id: 'p-ayam', name: 'Ayam Goreng', price: 18000 };

function cartOf(...products: CartProduct[]): Cart {
  return products.reduce<Cart>((cart, product) => addProduct(cart, product), EMPTY_CART);
}

describe('addProduct', () => {
  it('adds a new product with quantity 1 and a price snapshot', () => {
    const cart = addProduct(EMPTY_CART, NASI_GORENG);
    expect(cart).toEqual([{ productId: 'p-nasi', name: 'Nasi Goreng', unitPrice: 15000, quantity: 1 }]);
  });

  it('increases quantity instead of adding a duplicate line', () => {
    const cart = cartOf(NASI_GORENG, NASI_GORENG, NASI_GORENG);
    expect(cart).toHaveLength(1);
    expect(cart[0]?.quantity).toBe(3);
  });

  it('keeps the price from when the product was first added', () => {
    const cart = addProduct(cartOf(NASI_GORENG), { ...NASI_GORENG, price: 20000 });
    expect(cart[0]?.unitPrice).toBe(15000);
    expect(cart[0]?.quantity).toBe(2);
  });

  it('keeps several products in the order they were added', () => {
    const cart = cartOf(NASI_GORENG, ES_TEH, AYAM, ES_TEH);
    expect(cart.map((item) => item.productId)).toEqual(['p-nasi', 'p-teh', 'p-ayam']);
    expect(cart.map((item) => item.quantity)).toEqual([1, 2, 1]);
  });

  it.each([0, -1000, 1500.5])('rejects a product priced %s', (price) => {
    expect(() => addProduct(EMPTY_CART, { ...ES_TEH, price })).toThrow(RangeError);
  });

  it('does not mutate the previous cart', () => {
    const before = cartOf(NASI_GORENG);
    addProduct(before, NASI_GORENG);
    expect(before[0]?.quantity).toBe(1);
  });
});

describe('quantity changes', () => {
  it('increases quantity from 1 to 2 (AC-02)', () => {
    const cart = increaseQuantity(cartOf(NASI_GORENG), 'p-nasi');
    expect(quantityOf(cart, 'p-nasi')).toBe(2);
  });

  it('decreases quantity', () => {
    const cart = decreaseQuantity(cartOf(NASI_GORENG, NASI_GORENG, NASI_GORENG), 'p-nasi');
    expect(quantityOf(cart, 'p-nasi')).toBe(2);
  });

  it('never decreases below 1', () => {
    const cart = cartOf(NASI_GORENG);
    expect(decreaseQuantity(cart, 'p-nasi')).toBe(cart);
    expect(quantityOf(decreaseQuantity(cart, 'p-nasi'), 'p-nasi')).toBe(1);
  });

  it('changes only the targeted line', () => {
    const cart = increaseQuantity(cartOf(NASI_GORENG, ES_TEH), 'p-teh');
    expect(cart.map((item) => item.quantity)).toEqual([1, 2]);
  });

  it('ignores a product that is not in the cart', () => {
    const cart = cartOf(NASI_GORENG);
    expect(increaseQuantity(cart, 'missing')).toBe(cart);
    expect(decreaseQuantity(cart, 'missing')).toBe(cart);
  });
});

describe('removeProduct', () => {
  it('removes the line whatever its quantity', () => {
    const cart = removeProduct(cartOf(NASI_GORENG, NASI_GORENG, ES_TEH), 'p-nasi');
    expect(cart.map((item) => item.productId)).toEqual(['p-teh']);
  });

  it('can be re-added afterwards with quantity 1', () => {
    const cart = addProduct(removeProduct(cartOf(NASI_GORENG, NASI_GORENG), 'p-nasi'), NASI_GORENG);
    expect(quantityOf(cart, 'p-nasi')).toBe(1);
  });

  it('ignores a product that is not in the cart', () => {
    const cart = cartOf(NASI_GORENG);
    expect(removeProduct(cart, 'missing')).toBe(cart);
  });

  it('leaves an empty cart when the last line is removed', () => {
    expect(removeProduct(cartOf(ES_TEH), 'p-teh')).toEqual([]);
  });
});

describe('empty cart', () => {
  it('has no items, a zero total, and a zero count', () => {
    expect(EMPTY_CART).toEqual([]);
    expect(cartTotal(EMPTY_CART)).toBe(0);
    expect(cartItemCount(EMPTY_CART)).toBe(0);
    expect(quantityOf(EMPTY_CART, 'p-nasi')).toBe(0);
  });

  it('clearCart empties a filled cart', () => {
    expect(clearCart()).toEqual([]);
    expect(cartTotal(clearCart())).toBe(0);
  });
});

describe('subtotal and total', () => {
  it('computes a line subtotal as unit price × quantity (AC-03)', () => {
    const cart = increaseQuantity(cartOf(NASI_GORENG), 'p-nasi');
    expect(cart.map(itemSubtotal)).toEqual([30000]);
  });

  it('totals several products and quantities', () => {
    // Nasi Goreng ×2 = 30.000, Es Teh ×2 = 10.000
    const cart = cartOf(NASI_GORENG, NASI_GORENG, ES_TEH, ES_TEH);
    expect(cartTotal(cart)).toBe(40000);
    expect(cartItemCount(cart)).toBe(4);
  });

  it('updates the total after every change', () => {
    let cart = cartOf(NASI_GORENG, ES_TEH);
    expect(cartTotal(cart)).toBe(20000);
    cart = increaseQuantity(cart, 'p-teh');
    expect(cartTotal(cart)).toBe(25000);
    cart = decreaseQuantity(cart, 'p-teh');
    expect(cartTotal(cart)).toBe(20000);
    cart = removeProduct(cart, 'p-nasi');
    expect(cartTotal(cart)).toBe(5000);
  });

  it('counts units, not lines', () => {
    expect(cartItemCount(cartOf(NASI_GORENG, NASI_GORENG, ES_TEH))).toBe(3);
  });
});

describe('cartReducer', () => {
  const run = (...actions: CartAction[]) => actions.reduce(cartReducer, EMPTY_CART);

  it('applies the golden-path order: Nasi Goreng ×2 and Es Teh ×2 total Rp40.000 (AC-01..03)', () => {
    const cart = run(
      { type: 'add', product: NASI_GORENG },
      { type: 'add', product: NASI_GORENG },
      { type: 'add', product: ES_TEH },
      { type: 'increase', productId: 'p-teh' },
    );
    expect(cart.map((item) => [item.productId, item.quantity])).toEqual([
      ['p-nasi', 2],
      ['p-teh', 2],
    ]);
    expect(cartTotal(cart)).toBe(40000);
  });

  it('handles decrease, remove, and clear', () => {
    const filled = run({ type: 'add', product: NASI_GORENG }, { type: 'increase', productId: 'p-nasi' }, { type: 'add', product: ES_TEH });

    expect(quantityOf(cartReducer(filled, { type: 'decrease', productId: 'p-nasi' }), 'p-nasi')).toBe(1);
    expect(cartReducer(filled, { type: 'remove', productId: 'p-nasi' }).map((item) => item.productId)).toEqual(['p-teh']);
    expect(cartReducer(filled, { type: 'clear' })).toEqual([]);
  });

  it('returns the same cart for an action that changes nothing', () => {
    const cart = run({ type: 'add', product: NASI_GORENG });
    expect(cartReducer(cart, { type: 'decrease', productId: 'p-nasi' })).toBe(cart);
    expect(cartReducer(cart, { type: 'remove', productId: 'missing' })).toBe(cart);
  });

  it('is deterministic: the same actions always give the same cart', () => {
    const actions: CartAction[] = [
      { type: 'add', product: AYAM },
      { type: 'add', product: ES_TEH },
      { type: 'increase', productId: 'p-ayam' },
    ];
    expect(run(...actions)).toEqual(run(...actions));
  });
});

describe('at most 200 different products per sale (SEC-07, DATABASE D.9)', () => {
  const product = (n: number): CartProduct => ({ id: `p-${n}`, name: `Menu ${n}`, price: 1000 });
  const full = Array.from({ length: MAX_CART_LINES }, (_, n) => product(n)).reduce<Cart>(
    (cart, item) => addProduct(cart, item),
    EMPTY_CART,
  );

  it('fills up to 200 lines', () => {
    expect(MAX_CART_LINES).toBe(200);
    expect(full).toHaveLength(200);
  });

  it('refuses a 201st product and leaves the cart unchanged', () => {
    expect(canAddProduct(full, 'p-new')).toBe(false);
    expect(addProduct(full, product(999))).toBe(full);
  });

  it('still adds units of a product already in a full cart', () => {
    expect(canAddProduct(full, 'p-7')).toBe(true);
    expect(quantityOf(addProduct(full, product(7)), 'p-7')).toBe(2);
  });

  it('allows a new product again after a line is removed', () => {
    expect(canAddProduct(removeProduct(full, 'p-0'), 'p-new')).toBe(true);
  });
});

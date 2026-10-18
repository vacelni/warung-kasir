import { describe, expect, it } from 'vitest';
import {
  addProduct,
  canAddLine,
  cartItemCount,
  cartReducer,
  cartTotal,
  clearCart,
  decreaseQuantity,
  EMPTY_CART,
  increaseQuantity,
  itemSubtotal,
  lineIdFor,
  MAX_CART_LINES,
  MAX_NOTE_LENGTH,
  MAX_OPTIONS_PER_LINE,
  quantityOf,
  removeProduct,
  type Cart,
  type CartAction,
  type CartOption,
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
    expect(cart).toEqual([
      { lineId: 'p-nasi', productId: 'p-nasi', name: 'Nasi Goreng', unitPrice: 15000, quantity: 1, options: [], note: null },
    ]);
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
      { type: 'increase', lineId: 'p-teh' },
    );
    expect(cart.map((item) => [item.productId, item.quantity])).toEqual([
      ['p-nasi', 2],
      ['p-teh', 2],
    ]);
    expect(cartTotal(cart)).toBe(40000);
  });

  it('handles decrease, remove, and clear', () => {
    const filled = run({ type: 'add', product: NASI_GORENG }, { type: 'increase', lineId: 'p-nasi' }, { type: 'add', product: ES_TEH });

    expect(quantityOf(cartReducer(filled, { type: 'decrease', lineId: 'p-nasi' }), 'p-nasi')).toBe(1);
    expect(cartReducer(filled, { type: 'remove', lineId: 'p-nasi' }).map((item) => item.productId)).toEqual(['p-teh']);
    expect(cartReducer(filled, { type: 'clear' })).toEqual([]);
  });

  it('returns the same cart for an action that changes nothing', () => {
    const cart = run({ type: 'add', product: NASI_GORENG });
    expect(cartReducer(cart, { type: 'decrease', lineId: 'p-nasi' })).toBe(cart);
    expect(cartReducer(cart, { type: 'remove', lineId: 'missing' })).toBe(cart);
  });

  it('is deterministic: the same actions always give the same cart', () => {
    const actions: CartAction[] = [
      { type: 'add', product: AYAM },
      { type: 'add', product: ES_TEH },
      { type: 'increase', lineId: 'p-ayam' },
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
    expect(canAddLine(full, 'p-new')).toBe(false);
    expect(addProduct(full, product(999))).toBe(full);
  });

  it('still adds units of a product already in a full cart', () => {
    expect(canAddLine(full, 'p-7')).toBe(true);
    expect(quantityOf(addProduct(full, product(7)), 'p-7')).toBe(2);
  });

  it('allows a new product again after a line is removed', () => {
    expect(canAddLine(removeProduct(full, 'p-0'), 'p-new')).toBe(true);
  });
});

describe('products with options (DATABASE D.12)', () => {
  const GEPREK: CartProduct = { id: 'p-geprek', name: 'Geprek', price: 12000 };
  const level = (n: number): CartOption => ({ groupId: 'g-level', groupName: 'Level', choiceId: `c-level-${n}`, name: `Level ${n}`, priceDelta: 0 });
  const NASI: CartOption = { groupId: 'g-nasi', groupName: 'Nasi', choiceId: 'c-nasi', name: 'Pakai nasi', priceDelta: 4000 };
  const DADA: CartOption = { groupId: 'g-bagian', groupName: 'Bagian ayam', choiceId: 'c-dada', name: 'Dada', priceDelta: 3000 };
  const withOptions = (options: CartOption[], note?: string | null): CartProduct => ({ ...GEPREK, options, note });

  it('adds the price of every chosen option to the unit price', () => {
    // 12.000 + nasi 4.000 + dada 3.000 + level 3 (free) = 19.000
    const cart = addProduct(EMPTY_CART, withOptions([NASI, level(3), DADA]));
    expect(cart[0]?.unitPrice).toBe(19000);
    expect(cartTotal(cart)).toBe(19000);
  });

  it('keeps the chosen options on the line as a snapshot', () => {
    const cart = addProduct(EMPTY_CART, withOptions([level(3), NASI]));
    expect(cart[0]?.options).toEqual([level(3), NASI]);
    expect(cart[0]?.name).toBe('Geprek');
  });

  it('merges the same choices, in any order, into one line', () => {
    let cart = addProduct(EMPTY_CART, withOptions([NASI, level(3), DADA]));
    cart = addProduct(cart, withOptions([DADA, level(3), NASI]));
    expect(cart).toHaveLength(1);
    expect(cart[0]?.quantity).toBe(2);
    expect(cartTotal(cart)).toBe(38000);
  });

  it('keeps different choices as separate lines of the same product', () => {
    let cart = addProduct(EMPTY_CART, withOptions([level(3), NASI]));
    cart = addProduct(cart, withOptions([level(5), NASI]));
    cart = addProduct(cart, withOptions([level(5)]));
    expect(cart).toHaveLength(3);
    expect(cart.map((item) => item.unitPrice)).toEqual([16000, 16000, 12000]);
    expect(new Set(cart.map((item) => item.lineId)).size).toBe(3);
  });

  it('separates lines by note, and treats a blank note as no note', () => {
    let cart = addProduct(EMPTY_CART, withOptions([level(3)], 'sambal dipisah'));
    cart = addProduct(cart, withOptions([level(3)], null));
    cart = addProduct(cart, withOptions([level(3)], '   '));
    expect(cart.map((item) => [item.note, item.quantity])).toEqual([
      ['sambal dipisah', 1],
      [null, 2],
    ]);
  });

  it('gives a plain product the product id as its line id', () => {
    expect(lineIdFor('p-teh')).toBe('p-teh');
    expect(lineIdFor('p-teh', [], '  ')).toBe('p-teh');
  });

  it('changes quantity and removes one line without touching the others', () => {
    let cart = addProduct(EMPTY_CART, withOptions([level(3)]));
    cart = addProduct(cart, withOptions([level(5)]));
    const [first, second] = cart;
    cart = increaseQuantity(cart, second!.lineId);
    expect(cart.map((item) => item.quantity)).toEqual([1, 2]);
    cart = decreaseQuantity(cart, second!.lineId);
    cart = removeProduct(cart, first!.lineId);
    expect(cart.map((item) => item.lineId)).toEqual([second!.lineId]);
  });

  it('adds several units at once', () => {
    const cart = addProduct(EMPTY_CART, withOptions([NASI]), 3);
    expect(cart[0]?.quantity).toBe(3);
    expect(cartTotal(cart)).toBe(48000);
    expect(addProduct(cart, withOptions([NASI]), 2)[0]?.quantity).toBe(5);
    expect(() => addProduct(EMPTY_CART, GEPREK, 0)).toThrow(RangeError);
    expect(() => addProduct(EMPTY_CART, GEPREK, 1.5)).toThrow(RangeError);
  });

  it('counts units of a product across all its lines', () => {
    let cart = addProduct(EMPTY_CART, withOptions([level(3)]), 2);
    cart = addProduct(cart, withOptions([level(5)]));
    cart = addProduct(cart, ES_TEH);
    expect(quantityOf(cart, 'p-geprek')).toBe(3);
    expect(quantityOf(cart, 'p-teh')).toBe(1);
    expect(cartItemCount(cart)).toBe(4);
  });

  it('refuses a note or an option list the database would reject', () => {
    expect(() => addProduct(EMPTY_CART, withOptions([], 'x'.repeat(MAX_NOTE_LENGTH + 1)))).toThrow(RangeError);
    const many = Array.from({ length: MAX_OPTIONS_PER_LINE + 1 }, (_, n) => level(n));
    expect(() => addProduct(EMPTY_CART, withOptions(many))).toThrow(RangeError);
  });

  it('counts each different set of choices as its own line toward the 200-line limit', () => {
    const full = Array.from({ length: MAX_CART_LINES }, (_, n) => ({ ...GEPREK, options: [level(n)] })).reduce<Cart>(
      (cart, item) => addProduct(cart, item),
      EMPTY_CART,
    );
    expect(full).toHaveLength(200);
    expect(addProduct(full, withOptions([NASI]))).toBe(full);
    expect(quantityOf(addProduct(full, withOptions([level(7)])), 'p-geprek')).toBe(201);
  });
});

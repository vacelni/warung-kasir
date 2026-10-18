'use client';

import { createContext, useContext, useMemo, useReducer } from 'react';
import { cartItemCount, cartReducer, cartTotal, EMPTY_CART, type Cart, type CartProduct } from '@/lib/cart';
import type { Money } from '@/lib/money';

type CartContextValue = {
  cart: Cart;
  total: Money;
  itemCount: number;
  /** Adds `quantity` units (default 1) of a product with the options already chosen. */
  add: (product: CartProduct, quantity?: number) => void;
  increase: (lineId: string) => void;
  decrease: (lineId: string) => void;
  remove: (lineId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

/** In-memory cart for the /kasir section. All operations are local; no request is ever made (TECHNICAL_SPEC C.9). */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, dispatch] = useReducer(cartReducer, EMPTY_CART);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      total: cartTotal(cart),
      itemCount: cartItemCount(cart),
      add: (product, quantity) => dispatch({ type: 'add', product, quantity }),
      increase: (lineId) => dispatch({ type: 'increase', lineId }),
      decrease: (lineId) => dispatch({ type: 'decrease', lineId }),
      remove: (lineId) => dispatch({ type: 'remove', lineId }),
      clear: () => dispatch({ type: 'clear' }),
    }),
    [cart],
  );

  return <CartContext value={value}>{children}</CartContext>;
}

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart must be used inside <CartProvider>.');
  return value;
}

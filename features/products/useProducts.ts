'use client';

import { useCallback, useEffect, useState } from 'react';
import { listCategories, type Category } from '@/features/categories/api';
import { listProducts, type Product } from './api';

export type ProductsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; products: Product[]; categories: Category[] };

async function load(): Promise<ProductsState> {
  try {
    const [products, categories] = await Promise.all([listProducts(), listCategories()]);
    return { status: 'ready', products, categories };
  } catch (error) {
    console.error('Could not load the menu:', error);
    return { status: 'error' };
  }
}

/** The owner's menu: all products plus the categories to pick from. */
export function useProducts() {
  const [state, setState] = useState<ProductsState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void load().then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, []);

  /** After a failure: back to the loading state, then fetch again. */
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    void load().then(setState);
  }, []);

  /** After a change: fetch again while the current list stays on screen. */
  const refresh = useCallback(async () => {
    setState(await load());
  }, []);

  return { state, retry, refresh };
}

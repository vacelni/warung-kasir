'use client';

import { useCallback, useEffect, useState } from 'react';
import { listCategories, type Category } from '@/features/categories/api';
import { listOptionGroups, listProductLinks } from '@/features/options/api';
import type { OptionGroup, ProductGroupLink } from '@/features/options/model';
import { listProducts, type Product } from './api';

export type ProductsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; products: Product[]; categories: Category[]; groups: OptionGroup[]; links: ProductGroupLink[] };

async function load(): Promise<ProductsState> {
  try {
    const [products, categories, groups, links] = await Promise.all([
      listProducts(),
      listCategories(),
      listOptionGroups(),
      listProductLinks(),
    ]);
    return { status: 'ready', products, categories, groups, links };
  } catch (error) {
    console.error('Could not load the menu:', error);
    return { status: 'error' };
  }
}

/** The owner's menu: all products, the categories to pick from, and the option groups with their links. */
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

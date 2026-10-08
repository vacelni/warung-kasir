'use client';

import { useCallback, useEffect, useState } from 'react';
import { countProductsPerCategory, listCategories, type Category } from './api';

export type CategoriesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; categories: Category[]; productCounts: Record<string, number> };

async function load(): Promise<CategoriesState> {
  try {
    const [categories, productCounts] = await Promise.all([listCategories(), countProductsPerCategory()]);
    return { status: 'ready', categories, productCounts };
  } catch (error) {
    console.error('Could not load the categories:', error);
    return { status: 'error' };
  }
}

export function useCategories() {
  const [state, setState] = useState<CategoriesState>({ status: 'loading' });

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

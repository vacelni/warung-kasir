'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchCatalog, type Catalog } from './api';

export type CatalogState = { status: 'loading' } | { status: 'error' } | ({ status: 'ready' } & Catalog);

type CatalogContextValue = { state: CatalogState; reload: () => void };

const CatalogContext = createContext<CatalogContextValue | null>(null);

async function load(): Promise<CatalogState> {
  try {
    return { status: 'ready', ...(await fetchCatalog()) };
  } catch (error) {
    console.error('Could not load the catalog:', error);
    return { status: 'error' };
  }
}

/**
 * Holds the menu for the whole /kasir section, so going to the order and back does not
 * refetch. Cart operations never touch this (TECHNICAL_SPEC C.9).
 */
export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CatalogState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void load().then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    void load().then(setState);
  }, []);

  const value = useMemo(() => ({ state, reload }), [state, reload]);
  return <CatalogContext value={value}>{children}</CatalogContext>;
}

export function useCatalog(): CatalogContextValue {
  const value = useContext(CatalogContext);
  if (!value) throw new Error('useCatalog must be used inside <CatalogProvider>.');
  return value;
}

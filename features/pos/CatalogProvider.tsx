'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useProfile } from '@/features/auth/AuthProvider';
import { readCatalog, saveCatalog } from '@/features/offline/catalogCache';
import { fetchCatalog, type Catalog } from './api';

/**
 * `source: 'device'` = the server could not be reached and the menu is the copy saved on this
 * device at `savedAt` (TECHNICAL_SPEC C.10). Prices may be older than the server's; that is
 * accepted (D7) and the next online load replaces them.
 */
export type CatalogState =
  | { status: 'loading' }
  | { status: 'error' }
  | ({ status: 'ready'; source: 'server' } & Catalog)
  | ({ status: 'ready'; source: 'device'; savedAt: string } & Catalog);

type CatalogContextValue = { state: CatalogState; reload: () => void };

const CatalogContext = createContext<CatalogContextValue | null>(null);

async function readCached(userId: string, storeId: string) {
  try {
    return await readCatalog(userId, storeId);
  } catch (error) {
    console.error('Could not read the menu saved on this device:', error);
    return null;
  }
}

/**
 * Holds the menu for the whole /kasir section, so going to the order and back does not
 * refetch. Cart operations never touch this (TECHNICAL_SPEC C.9).
 *
 * The device copy shows at once; the server copy replaces it when it arrives and is saved for the
 * next offline start. Refreshed when /kasir opens and when the network comes back.
 */
export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const { id: userId, storeId } = useProfile();
  const [state, setState] = useState<CatalogState>({ status: 'loading' });
  // Latest load wins; an older answer arriving late is ignored.
  const generation = useRef(0);

  const load = useCallback(() => {
    const current = ++generation.current;
    const isCurrent = () => generation.current === current;
    let fromServer = false;

    const cached = readCached(userId, storeId).then((copy) => {
      // Only fills an empty screen; never replaces a server answer or a menu already shown.
      if (copy && isCurrent() && !fromServer) {
        setState((prev) => (prev.status === 'ready' ? prev : { status: 'ready', source: 'device', ...copy }));
      }
      return copy;
    });

    fetchCatalog().then(
      (catalog) => {
        if (!isCurrent()) return;
        fromServer = true;
        setState({ status: 'ready', source: 'server', ...catalog });
        saveCatalog(userId, storeId, catalog, new Date()).catch((error: unknown) =>
          console.error('Could not save the menu on this device:', error),
        );
      },
      async (error: unknown) => {
        console.error('Could not load the catalog:', error);
        const copy = await cached;
        if (!isCurrent()) return;
        setState((prev) => {
          if (prev.status === 'ready') return prev;
          return copy ? { status: 'ready', source: 'device', ...copy } : { status: 'error' };
        });
      },
    );
  }, [userId, storeId]);

  useEffect(() => {
    load();
    window.addEventListener('online', load);
    return () => {
      generation.current += 1;
      window.removeEventListener('online', load);
    };
  }, [load]);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    load();
  }, [load]);

  const value = useMemo(() => ({ state, reload }), [state, reload]);
  return <CatalogContext value={value}>{children}</CatalogContext>;
}

export function useCatalog(): CatalogContextValue {
  const value = useContext(CatalogContext);
  if (!value) throw new Error('useCatalog must be used inside <CatalogProvider>.');
  return value;
}

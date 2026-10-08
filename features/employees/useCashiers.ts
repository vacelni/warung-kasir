'use client';

import { useCallback, useEffect, useState } from 'react';
import { listCashiers, type Cashier } from './api';

export type CashiersState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; cashiers: Cashier[] };

async function load(): Promise<CashiersState> {
  try {
    return { status: 'ready', cashiers: await listCashiers() };
  } catch (error) {
    console.error('Could not load the cashiers:', error);
    return { status: 'error' };
  }
}

/** The owner's cashier list. */
export function useCashiers() {
  const [state, setState] = useState<CashiersState>({ status: 'loading' });

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

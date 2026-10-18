'use client';

import { useCallback, useEffect, useState } from 'react';
import { listOptionGroups, listProductLinks } from './api';
import type { OptionGroup, ProductGroupLink } from './model';

export type OptionGroupsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; groups: OptionGroup[]; links: ProductGroupLink[] };

async function load(): Promise<OptionGroupsState> {
  try {
    const [groups, links] = await Promise.all([listOptionGroups(), listProductLinks()]);
    return { status: 'ready', groups, links };
  } catch (error) {
    console.error('Could not load the option groups:', error);
    return { status: 'error' };
  }
}

/** The owner's option groups with their choices, and which products use them. */
export function useOptionGroups() {
  const [state, setState] = useState<OptionGroupsState>({ status: 'loading' });

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

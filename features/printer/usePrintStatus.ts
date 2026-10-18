'use client';

import { useCallback, useRef, useState } from 'react';
import { printErrorMessage } from './bluetooth';

export type PrintStatus =
  | { state: 'idle' }
  | { state: 'busy' }
  | { state: 'done' }
  | { state: 'error'; message: string };

/**
 * Runs one printer action at a time and reports it. A second tap while one is running does nothing,
 * so a double tap never prints two receipts. Closing the device chooser is not an error.
 */
export function usePrintStatus(): { status: PrintStatus; run: (action: () => Promise<void>) => Promise<void> } {
  const [status, setStatus] = useState<PrintStatus>({ state: 'idle' });
  const running = useRef(false);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setStatus({ state: 'busy' });
    try {
      await action();
      setStatus({ state: 'done' });
    } catch (error) {
      const message = printErrorMessage(error);
      if (message === null) {
        setStatus({ state: 'idle' });
      } else {
        console.error('Printing failed; the sale is unaffected:', error);
        setStatus({ state: 'error', message });
      }
    } finally {
      running.current = false;
    }
  }, []);

  return { status, run };
}

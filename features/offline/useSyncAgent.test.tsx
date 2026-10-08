// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSyncAgent } from './useSyncAgent';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  setCashier: vi.fn(),
  outboxChanged: vi.fn(),
  sessionRefreshed: null as (() => void) | null,
  otherTab: null as (() => void) | null,
  persist: vi.fn(),
}));

vi.mock('./syncManager', () => ({
  syncManager: { request: mocks.request, setCashier: mocks.setCashier, outboxChanged: mocks.outboxChanged },
  onOtherTabChange: (callback: () => void) => {
    mocks.otherTab = callback;
    return () => (mocks.otherTab = null);
  },
}));
vi.mock('@/features/auth/api', () => ({
  onSessionRefreshed: (callback: () => void) => {
    mocks.sessionRefreshed = callback;
    return () => (mocks.sessionRefreshed = null);
  },
}));
vi.mock('@/lib/idb', () => ({ requestPersistentStorage: mocks.persist }));

function Agent({ cashierId }: { cashierId: string }) {
  useSyncAgent(cashierId);
  return null;
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.request.mockResolvedValue({});
});
afterEach(cleanup);

describe('useSyncAgent (TECHNICAL_SPEC C.12 triggers)', () => {
  it('on start: sets the user, asks for persistent storage, and syncs once', () => {
    render(<Agent cashierId="cashier-1" />);

    expect(mocks.setCashier).toHaveBeenCalledWith('cashier-1');
    expect(mocks.persist).toHaveBeenCalledOnce();
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith('start');
  });

  it('routes online, tab visible, and session refreshed through the one sync manager', () => {
    render(<Agent cashierId="cashier-1" />);
    mocks.request.mockClear();

    window.dispatchEvent(new Event('online'));
    setVisibility('hidden');
    setVisibility('visible');
    mocks.sessionRefreshed?.();

    expect(mocks.request.mock.calls).toEqual([['online'], ['visible'], ['session']]);
  });

  it('another tab changing the outbox refreshes the counts here, without syncing', () => {
    render(<Agent cashierId="cashier-1" />);
    mocks.request.mockClear();

    mocks.otherTab?.();

    expect(mocks.outboxChanged).toHaveBeenCalledOnce();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('stops listening and forgets the user when the shell unmounts (logout)', () => {
    const view = render(<Agent cashierId="cashier-1" />);
    view.unmount();
    mocks.request.mockClear();

    window.dispatchEvent(new Event('online'));

    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.setCashier).toHaveBeenLastCalledWith(null);
    expect(mocks.sessionRefreshed).toBeNull();
  });
});

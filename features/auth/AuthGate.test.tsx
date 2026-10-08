// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/layout/AppShell';
import { resetIndexedDb } from '@/lib/test-support/fakeIndexedDb';
import type { Profile, SessionState } from './account';
import { AuthGate } from './AuthGate';
import { AuthProvider } from './AuthProvider';
import { RouteAccess } from './RouteAccess';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  pathname: '/kasir',
  loadSession: vi.fn(),
  signOut: vi.fn(),
  clearDeviceCaches: vi.fn(),
  cachedSession: vi.fn(),
  signedOutListener: null as (() => void) | null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => mocks.pathname,
}));

vi.mock('./api', () => ({
  loadSession: mocks.loadSession,
  signOut: mocks.signOut,
  clearDeviceCaches: mocks.clearDeviceCaches,
  cachedSession: mocks.cachedSession,
  onSessionRefreshed: () => () => {},
  onSignedOut: (callback: () => void) => {
    mocks.signedOutListener = callback;
    return () => {
      mocks.signedOutListener = null;
    };
  },
}));

const cashier: Profile = {
  id: 'a2000000-0000-4000-8000-000000000001',
  storeId: '5a000000-0000-4000-8000-000000000001',
  name: 'Andi',
  role: 'cashier',
};
const owner: Profile = { ...cashier, id: 'a1000000-0000-4000-8000-000000000001', name: 'Bu Sari', role: 'owner' };

function sessionIs(state: SessionState) {
  mocks.loadSession.mockResolvedValue(state);
}

function renderApp() {
  return render(
    <AuthProvider>
      <AuthGate>
        <AppShell>
          <RouteAccess>
            <p>Konten privat</p>
          </RouteAccess>
        </AppShell>
      </AuthGate>
    </AuthProvider>,
  );
}

beforeEach(async () => {
  await resetIndexedDb();
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  mocks.cachedSession.mockResolvedValue(null);
  mocks.pathname = '/kasir';
  mocks.signedOutListener = null;
  // Like auth-js: signing out emits SIGNED_OUT to listeners.
  mocks.signOut.mockImplementation(async () => mocks.signedOutListener?.());
});

afterEach(() => {
  cleanup();
});

describe('AuthGate (AC-13)', () => {
  it('shows a loading state, never private content, while the session is checked', () => {
    mocks.loadSession.mockReturnValue(new Promise(() => {}));
    renderApp();

    expect(screen.getByText('Memuat…')).toBeTruthy();
    expect(screen.queryByText('Konten privat')).toBeNull();
  });

  it('redirects to login without a session', async () => {
    sessionIs({ status: 'signedOut', reason: null });
    renderApp();

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('Konten privat')).toBeNull();
  });

  it('redirects with a reason when the account is inactive', async () => {
    sessionIs({ status: 'signedOut', reason: 'inactive' });
    renderApp();

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login?alasan=inactive'));
  });

  it('renders the app with the user name when signed in', async () => {
    sessionIs({ status: 'signedIn', profile: cashier });
    renderApp();

    expect(await screen.findByText('Konten privat')).toBeTruthy();
    expect(within(screen.getByRole('banner')).getByText('Andi')).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('keeps the user in the app when the server is unreachable and retries on request (D5)', async () => {
    sessionIs({ status: 'unreachable' });
    renderApp();

    const retry = await screen.findByRole('button', { name: 'COBA LAGI' });
    expect(mocks.replace).not.toHaveBeenCalled();

    sessionIs({ status: 'signedIn', profile: cashier });
    fireEvent.click(retry);

    expect(await screen.findByText('Konten privat')).toBeTruthy();
    expect(mocks.loadSession).toHaveBeenCalledTimes(2);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('opens offline with the cached profile, no redirect, no blocking screen (D5)', async () => {
    sessionIs({ status: 'signedIn', profile: cashier, offline: true });
    renderApp();

    expect(await screen.findByText('Konten privat')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'COBA LAGI' })).toBeNull();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('offline profile: when the network returns and the server rejects the session, goes to login', async () => {
    sessionIs({ status: 'signedIn', profile: cashier, offline: true });
    renderApp();
    await screen.findByText('Konten privat');

    sessionIs({ status: 'signedOut', reason: 'expired' });
    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login?alasan=expired'));
    expect(mocks.loadSession).toHaveBeenCalledTimes(2);
  });

  it('offline profile: when the network returns and the server confirms, stays in the app', async () => {
    sessionIs({ status: 'signedIn', profile: cashier, offline: true });
    renderApp();
    await screen.findByText('Konten privat');

    sessionIs({ status: 'signedIn', profile: { ...cashier, name: 'Andi P.' } });
    window.dispatchEvent(new Event('online'));

    expect(await within(screen.getByRole('banner')).findByText('Andi P.')).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('offline profile: still unreachable after an online event, stays in the app as is', async () => {
    sessionIs({ status: 'signedIn', profile: cashier, offline: true });
    renderApp();
    await screen.findByText('Konten privat');

    sessionIs({ status: 'unreachable' });
    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(mocks.loadSession).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Konten privat')).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('a verified session does not re-check on every online event', async () => {
    sessionIs({ status: 'signedIn', profile: cashier });
    renderApp();
    await screen.findByText('Konten privat');

    window.dispatchEvent(new Event('online'));

    expect(mocks.loadSession).toHaveBeenCalledOnce();
  });

  it('no network at all: opens at once with the cached profile while the server check is still running', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    let finishCheck!: (state: SessionState) => void;
    mocks.loadSession.mockReturnValue(new Promise<SessionState>((resolve) => (finishCheck = resolve)));
    mocks.cachedSession.mockResolvedValue({ status: 'signedIn', profile: cashier, offline: true });
    renderApp();

    expect(await screen.findByText('Konten privat')).toBeTruthy();

    // The slow check ends "still unreachable": the app stays open.
    finishCheck({ status: 'unreachable' });
    await waitFor(() => expect(mocks.loadSession).toHaveBeenCalledOnce());
    expect(screen.getByText('Konten privat')).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('a late server rejection after opening from the cache still sends the user to login', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    let finishCheck!: (state: SessionState) => void;
    mocks.loadSession.mockReturnValue(new Promise<SessionState>((resolve) => (finishCheck = resolve)));
    mocks.cachedSession.mockResolvedValue({ status: 'signedIn', profile: cashier, offline: true });
    renderApp();
    await screen.findByText('Konten privat');

    finishCheck({ status: 'signedOut', reason: 'expired' });

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login?alasan=expired'));
  });

  it('slow server, nothing cached: keeps loading, never opens without an identity', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    mocks.loadSession.mockReturnValue(new Promise(() => {}));
    renderApp();

    await waitFor(() => expect(mocks.cachedSession).toHaveBeenCalled());
    expect(screen.getByText('Memuat…')).toBeTruthy();
    expect(screen.queryByText('Konten privat')).toBeNull();
  });

  it('sends the user to login when the server ends the session while in use', async () => {
    sessionIs({ status: 'signedIn', profile: cashier });
    renderApp();
    await screen.findByText('Konten privat');

    mocks.signedOutListener?.();

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login?alasan=expired'));
    expect(screen.queryByText('Konten privat')).toBeNull();
    // The cached profile and catalog go with the session; the outbox stays (C.10, C.12).
    expect(mocks.clearDeviceCaches).toHaveBeenCalled();
  });

  it('logs out to the login page without an "expired" notice', async () => {
    sessionIs({ status: 'signedIn', profile: owner });
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: 'Keluar' }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login'));
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.replace).not.toHaveBeenCalledWith('/login?alasan=expired');
  });
});

describe('RouteAccess (role behavior, UX only)', () => {
  it('shows access denied to a cashier on an owner-only route', async () => {
    mocks.pathname = '/laporan';
    sessionIs({ status: 'signedIn', profile: cashier });
    renderApp();

    expect(await screen.findByRole('heading', { name: 'Akses ditolak' })).toBeTruthy();
    expect(screen.queryByText('Konten privat')).toBeNull();
  });

  it('lets the owner open an owner-only route', async () => {
    mocks.pathname = '/laporan';
    sessionIs({ status: 'signedIn', profile: owner });
    renderApp();

    expect(await screen.findByText('Konten privat')).toBeTruthy();
  });

  it('lets a cashier open their own transaction history', async () => {
    mocks.pathname = '/riwayat';
    sessionIs({ status: 'signedIn', profile: cashier });
    renderApp();

    expect(await screen.findByText('Konten privat')).toBeTruthy();
  });
});

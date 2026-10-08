// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/components/layout/AppShell';
import type { Profile, SessionState } from './account';
import { AuthGate } from './AuthGate';
import { AuthProvider } from './AuthProvider';
import { RouteAccess } from './RouteAccess';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  pathname: '/kasir',
  loadSession: vi.fn(),
  signOut: vi.fn(),
  signedOutListener: null as (() => void) | null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => mocks.pathname,
}));

vi.mock('./api', () => ({
  loadSession: mocks.loadSession,
  signOut: mocks.signOut,
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

beforeEach(() => {
  vi.clearAllMocks();
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

  it('sends the user to login when the server ends the session while in use', async () => {
    sessionIs({ status: 'signedIn', profile: cashier });
    renderApp();
    await screen.findByText('Konten privat');

    mocks.signedOutListener?.();

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login?alasan=expired'));
    expect(screen.queryByText('Konten privat')).toBeNull();
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

'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Profile, SessionState } from './account';
import { cachedSession, clearDeviceCaches, loadSession, onSessionRefreshed, onSignedOut, signOut } from './api';

export type AuthState = { status: 'loading' } | SessionState;

type AuthContextValue = {
  state: AuthState;
  /** Re-checks the session after an unreachable server. */
  retry: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function resolveSession(): Promise<SessionState> {
  try {
    return await loadSession();
  } catch (error) {
    console.error('Could not load the session:', error);
    return { status: 'unreachable' };
  }
}

/**
 * How long app start waits for the server before opening with the cached profile. Offline, a token
 * refresh is retried by auth-js for up to ~25 s and a profile read for ~7 s; the cashier must not
 * wait for that to sell. With no network at all (navigator.onLine false) it does not wait.
 */
export const START_TIMEOUT_MS = 4_000;

/** A late server answer replaces the cached profile, unless it only says "still unreachable". */
function settle(prev: AuthState, next: SessionState): AuthState {
  const openedFromCache = prev.status === 'signedIn' && prev.offline === true;
  return openedFromCache && next.status === 'unreachable' ? prev : next;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const loggingOut = useRef(false);

  useEffect(() => {
    let active = true;
    let resolved = false;
    void resolveSession().then((next) => {
      resolved = true;
      if (active) setState((prev) => settle(prev, next));
    });
    // The server check keeps running; if it later rejects the session, the app still goes to login.
    const fallback = setTimeout(
      () => {
        if (resolved) return;
        cachedSession()
          .then((cached) => {
            if (active && !resolved && cached) setState((prev) => (prev.status === 'loading' ? cached : prev));
          })
          .catch((error: unknown) => console.error('Could not read the cached profile:', error));
      },
      navigator.onLine ? START_TIMEOUT_MS : 0,
    );

    let unsubscribe = () => {};
    try {
      unsubscribe = onSignedOut(() => {
        // The session ended outside the app (refresh token rejected, logout in another tab):
        // drop the cached profile and catalog. The outbox stays (TECHNICAL_SPEC C.12).
        void clearDeviceCaches();
        // Only a session in use can end here; during start-up loadSession decides.
        setState((prev) =>
          prev.status === 'signedIn'
            ? { status: 'signedOut', reason: loggingOut.current ? null : 'expired' }
            : prev,
        );
      });
    } catch (error) {
      console.error('Could not watch the session:', error);
    }

    return () => {
      active = false;
      clearTimeout(fallback);
      unsubscribe();
    };
  }, []);

  // Opened offline with the cached profile (D5): as soon as the network or the session is back,
  // ask the server again. It either confirms the account (stay, now verified) or rejects the
  // session or the profile (go to login; the outbox stays). Still unreachable: nothing changes.
  const offline = state.status === 'signedIn' && state.offline === true;
  useEffect(() => {
    if (!offline) return;
    let checking = false;
    let active = true;
    function recheck() {
      if (checking || document.visibilityState !== 'visible') return;
      checking = true;
      void resolveSession().then((next) => {
        checking = false;
        const stillOffline = next.status === 'unreachable' || (next.status === 'signedIn' && next.offline);
        if (active && !stillOffline) setState(next);
      });
    }
    window.addEventListener('online', recheck);
    document.addEventListener('visibilitychange', recheck);
    let stopSession = () => {};
    try {
      stopSession = onSessionRefreshed(recheck);
    } catch (error) {
      console.error('Could not watch the session:', error);
    }
    return () => {
      active = false;
      window.removeEventListener('online', recheck);
      document.removeEventListener('visibilitychange', recheck);
      stopSession();
    };
  }, [offline]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    void resolveSession().then(setState);
  }, []);

  const logout = useCallback(async () => {
    loggingOut.current = true;
    await signOut();
    setState({ status: 'signedOut', reason: null });
  }, []);

  const value = useMemo(() => ({ state, retry, logout }), [state, retry, logout]);
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}

/** The signed-in profile. Only valid below <AuthGate>, which renders children only when signed in. */
export function useProfile(): Profile {
  const { state } = useAuth();
  if (state.status !== 'signedIn') throw new Error('useProfile must be used below <AuthGate>.');
  return state.profile;
}

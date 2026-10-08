'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Profile, SessionState } from './account';
import { loadSession, onSignedOut, signOut } from './api';

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const loggingOut = useRef(false);

  useEffect(() => {
    let active = true;
    void resolveSession().then((next) => {
      if (active) setState(next);
    });

    let unsubscribe = () => {};
    try {
      unsubscribe = onSignedOut(() => {
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
      unsubscribe();
    };
  }, []);

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

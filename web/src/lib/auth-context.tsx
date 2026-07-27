'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { auth } from './api';
import type { User } from './types';

interface AuthContextValue {
  user: User | null;
  /** True until the initial session probe resolves. Guards redirect flicker. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * The access token is httpOnly, so the client cannot read it to find out
   * whether it is signed in — it has to ask. One /me call on mount does that;
   * the api client transparently refreshes underneath if the token is stale.
   */
  const refresh = useCallback(async () => {
    try {
      const res = await auth.me();
      setUser(res.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await auth.login({ email, password });
    setUser(res.user);
  }, []);

  const signup = useCallback(
    async (input: { email: string; password: string; firstName: string; lastName: string }) => {
      const res = await auth.signup(input);
      setUser(res.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await auth.logout();
    } finally {
      // Clear locally even if the request failed — the user asked to leave.
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, signup, logout, refresh }),
    [user, loading, login, signup, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

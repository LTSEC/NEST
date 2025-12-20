import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  SessionToken,
  VerifiedUser,
  clearAuthCookie,
  readAuthCookie,
  setAuthCookie,
  verifyTokenAgainstUserTable,
} from '../auth';
import { useSessionVerification } from '../hooks/useSessionVerification';

export type AuthContextType = {
  user: VerifiedUser | null;
  token: SessionToken | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (token: SessionToken, user?: VerifiedUser) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [token, setToken] = useState<SessionToken | null>(() => readAuthCookie());
  const [user, setUser] = useState<VerifiedUser | null>(null);

  const { user: verifiedUser, loading } = useSessionVerification(token);

  useEffect(() => {
    setUser(verifiedUser);
  }, [verifiedUser]);

  const login = useCallback(
    async (newToken: SessionToken, overrideUser?: VerifiedUser) => {
      setAuthCookie(newToken);
      setToken(newToken);

      if (overrideUser) {
        setUser(overrideUser);
        return;
      }

      const verified = await verifyTokenAgainstUserTable(newToken);
      setUser(verified);
    },
    []
  );

  const logout = useCallback(() => {
    clearAuthCookie();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      loading,
      login,
      logout,
    }),
    [loading, login, logout, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};

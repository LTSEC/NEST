import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  SessionToken,
  VerifiedUser,
  clearAuthCookie,
  readAuthCookie,
  setAuthCookie,
  updateUserNameInPostgres,
  upsertUserInMockTable,
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
  updateUserName: (name: string) => Promise<VerifiedUser>;
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
        upsertUserInMockTable(newToken, overrideUser);
        setUser(overrideUser);
        return;
      }

      const verified = await verifyTokenAgainstUserTable(newToken);
      if (verified) {
        upsertUserInMockTable(newToken, verified);
      }
      setUser(verified);
    },
    []
  );

  const updateUserName = useCallback(
    async (name: string) => {
      if (!token || !user) {
        throw new Error('User is not authenticated');
      }

      const updatedUser = await updateUserNameInPostgres(token, name.trim());
      setUser(updatedUser);
      return updatedUser;
    },
    [token, user]
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
      updateUserName,
    }),
    [loading, login, logout, token, updateUserName, user]
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

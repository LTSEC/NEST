export const AUTH_COOKIE_NAME = 'nest_auth_token';
export const AUTH_TOKEN_EXPIRY_HOURS = 24;

export type SessionToken = string;

export const setAuthCookie = (token: SessionToken): void => {
  const expires = new Date(Date.now() + AUTH_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
  document.cookie = `${AUTH_COOKIE_NAME}=${token}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
};

export const readAuthCookie = (): SessionToken | null => {
  const value = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith(`${AUTH_COOKIE_NAME}=`))
    ?.split('=')[1];

  return value ?? null;
};

export const clearAuthCookie = (): void => {
  document.cookie = `${AUTH_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`;
};

export type UserRole = 'user' | 'developer';

export type VerifiedUser = {
  id: string;
  name: string;
  email?: string;
  role: UserRole;
};

// Stubbed implementation to demonstrate how a backend service might verify the token
// against a Postgres user table. Replace with a real fetch/DB call when available.
export const verifyTokenAgainstUserTable = async (
  token: SessionToken
): Promise<VerifiedUser | null> => {
  if (!token) {
    return null;
  }

  // Placeholder lookup logic. Replace with a query such as:
  // SELECT id, name, email FROM users WHERE session_token = $1 LIMIT 1;
  if (token === 'demo-token') {
    return { id: '1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'user' };
  }

  if (token === 'developer-demo-token') {
    return { id: '42', name: 'Dev Admin', email: 'dev@example.com', role: 'developer' };
  }

  return null;
};

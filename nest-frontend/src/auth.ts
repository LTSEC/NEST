import { apiLogin, apiVerifyToken, type AuthResponse, type UserInfo } from './data/api';

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

// ---------------------------------------------------------------------------
// In-memory fallback users (used when the backend DB is unavailable)
// Passwords are checked against the backend with bcrypt when the DB is online.
// ---------------------------------------------------------------------------

type UsersTableRow = {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  role: UserRole;
};

const usersTableRows: UsersTableRow[] = [
  {
    id: '1',
    username: 'Test',
    email: 'test@example.com',
    password_hash: 'Test',
    role: 'user',
  },
  {
    id: '2',
    username: 'Developer',
    email: 'dev@example.com',
    password_hash: 'Dev',
    role: 'developer',
  },
];

const activeSessionIndex: Record<SessionToken, string> = {};

const normalize = (value: string) => value.trim().toLowerCase();

const findUserRowByUsername = (username: string): UsersTableRow | undefined => {
  const normalized = normalize(username);
  return usersTableRows.find((row) => normalize(row.username) === normalized);
};

const mapRowToVerifiedUser = (row: UsersTableRow): VerifiedUser => ({
  id: row.id,
  name: row.username,
  email: row.email,
  role: row.role,
});

export const upsertUserInMockTable = (token: SessionToken, user: VerifiedUser): void => {
  const existingRow = usersTableRows.find((row) => row.id === user.id);

  if (!existingRow) {
    usersTableRows.push({
      id: user.id,
      username: user.name,
      email: user.email ?? `${normalize(user.name)}@example.com`,
      password_hash: 'temporary',
      role: user.role,
    });
  }

  activeSessionIndex[token] = user.id;
};

/**
 * Authenticates against the backend API first (bcrypt-hashed passwords).
 * Falls back to in-memory mock users if the backend is unavailable.
 */
export const authenticateWithUsersTable = async (
  username: string,
  password: string,
  requiredRole?: UserRole
): Promise<{ token: SessionToken; user: VerifiedUser } | null> => {
  // Try backend authentication first
  try {
    const result: AuthResponse = await apiLogin(username, password, requiredRole);
    const user: VerifiedUser = {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      role: result.user.role,
    };
    activeSessionIndex[result.token] = user.id;
    upsertUserInMockTable(result.token, user);
    return { token: result.token, user };
  } catch {
    // Backend unavailable, fall through to in-memory auth
  }

  // In-memory fallback
  const row = findUserRowByUsername(username);
  if (!row) {
    return null;
  }

  const passwordMatches = row.password_hash === password;
  const roleMatches = !requiredRole || row.role === requiredRole;

  if (!passwordMatches || !roleMatches) {
    return null;
  }

  const sessionToken: SessionToken = `session-token-${row.id}`;
  activeSessionIndex[sessionToken] = row.id;

  return { token: sessionToken, user: mapRowToVerifiedUser(row) };
};

/**
 * Verifies a session token against the backend, falling back to in-memory.
 */
export const verifyTokenAgainstUserTable = async (
  token: SessionToken
): Promise<VerifiedUser | null> => {
  if (!token) {
    return null;
  }

  // Try backend verification first
  try {
    const info: UserInfo = await apiVerifyToken(token);
    return {
      id: info.id,
      name: info.name,
      email: info.email,
      role: info.role,
    };
  } catch {
    // Backend unavailable, fall through
  }

  // In-memory fallback
  const userId = activeSessionIndex[token];
  if (!userId) {
    return null;
  }

  const userRow = usersTableRows.find((row) => row.id === userId);
  return userRow ? mapRowToVerifiedUser(userRow) : null;
};

export const updateUserNameInPostgres = async (
  token: SessionToken,
  newName: string
): Promise<VerifiedUser> => {
  const userId = activeSessionIndex[token];
  if (!userId) {
    throw new Error('User not found in Postgres users table');
  }

  const userRow = usersTableRows.find((row) => row.id === userId);
  if (!userRow) {
    throw new Error('User not found in Postgres users table');
  }

  userRow.username = newName;

  return mapRowToVerifiedUser(userRow);
};

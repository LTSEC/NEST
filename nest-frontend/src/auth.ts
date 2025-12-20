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

type UsersTableRow = {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  password_plain?: string;
  role: UserRole;
};

// Simulated SQL users table seeded from db/init.sql. These values mirror the
// INSERT statements used when spinning up a development database.
const usersTableRows: UsersTableRow[] = [
  {
    id: '1',
    username: 'Test',
    email: 'test@example.com',
    password_hash: 'Test',
    password_plain: 'Test',
    role: 'user',
  },
  {
    id: '2',
    username: 'Developer',
    email: 'dev@example.com',
    password_hash: 'Dev',
    password_plain: 'Dev',
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
      password_plain: 'temporary',
      role: user.role,
    });
  }

  activeSessionIndex[token] = user.id;
};

// Stubbed implementation to demonstrate how a backend service might verify the token
// against a Postgres users table. Replace with a real fetch/DB call when available.
export const verifyTokenAgainstUserTable = async (
  token: SessionToken
): Promise<VerifiedUser | null> => {
  if (!token) {
    return null;
  }

  const userId = activeSessionIndex[token];
  if (!userId) {
    return null;
  }

  const userRow = usersTableRows.find((row) => row.id === userId);
  return userRow ? mapRowToVerifiedUser(userRow) : null;
};

export const authenticateWithUsersTable = async (
  username: string,
  password: string,
  requiredRole?: UserRole
): Promise<{ token: SessionToken; user: VerifiedUser } | null> => {
  const row = findUserRowByUsername(username);
  if (!row) {
    return null;
  }

  const passwordMatches = row.password_plain === password || row.password_hash === password;
  const roleMatches = !requiredRole || row.role === requiredRole;

  if (!passwordMatches || !roleMatches) {
    return null;
  }

  const sessionToken: SessionToken = `session-token-${row.id}`;
  activeSessionIndex[sessionToken] = row.id;

  return { token: sessionToken, user: mapRowToVerifiedUser(row) };
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

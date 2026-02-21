/**
 * Central API client for communicating with the Go backend.
 *
 * All database-backed endpoints live under /api/db/*.
 * Authentication endpoints live under /api/auth/*.
 * Terraform hosting endpoints remain at /api/games/* for backwards compatibility.
 */

const API_BASE = 'http://localhost:4545';

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string;
};

const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const { method = 'GET', body, token } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let message = `Request failed (HTTP ${response.status})`;
    try {
      const errorBody = await response.json();
      if (errorBody?.error) message = errorBody.error;
    } catch {
      // use default message
    }
    throw new Error(message);
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  return response.json() as Promise<T>;
};

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export type AuthResponse = {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: 'user' | 'developer';
  };
};

export type UserInfo = {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'developer';
};

export const apiLogin = (username: string, password: string, role?: string): Promise<AuthResponse> =>
  request('/api/auth/login', { method: 'POST', body: { username, password, role } });

export const apiVerifyToken = (token: string): Promise<UserInfo> =>
  request('/api/auth/verify', { token });

export const apiLogout = (token: string): Promise<void> =>
  request('/api/auth/logout', { method: 'POST', token });

// ---------------------------------------------------------------------------
// Games (database-backed)
// ---------------------------------------------------------------------------

export type DBGame = {
  id: number;
  name: string;
  developerId: number;
  types: string[];
  rvbServices: string[];
  credentials: { username: string; password: string }[];
  teamCount: number;
  presetId?: string;
  blackTeamCidr?: string;
  networkSnapshot?: unknown;
  createdAt: string;
  updatedAt: string;
};

export const apiListGames = (developerId: number): Promise<DBGame[]> =>
  request(`/api/db/games?developerId=${developerId}`);

export const apiCreateGame = (game: Partial<DBGame>): Promise<DBGame> =>
  request('/api/db/games', { method: 'POST', body: game });

export const apiUpdateGame = (id: number, game: Partial<DBGame>): Promise<DBGame> =>
  request(`/api/db/games/${id}`, { method: 'PUT', body: game });

export const apiDeleteGame = (id: number, developerId: number): Promise<void> =>
  request(`/api/db/games/${id}?developerId=${developerId}`, { method: 'DELETE' });

export const apiSaveNetworkSnapshot = (gameId: number, snapshot: unknown): Promise<void> =>
  request(`/api/db/games/${gameId}/network`, { method: 'PUT', body: snapshot });

// ---------------------------------------------------------------------------
// Sessions (database-backed)
// ---------------------------------------------------------------------------

export type DBSession = {
  id: number;
  gameId: number;
  developerId: number;
  gameName: string;
  developerName: string;
  types: string[];
  startTime: string;
  endTime: string;
  visibility: 'public' | 'private';
  minPlayers: number;
  status: 'scheduled' | 'running' | 'paused' | 'completed';
  infrastructureId?: number;
  infrastructureStatus?: 'creating' | 'active' | 'destroying' | 'error';
  createdAt: string;
  updatedAt: string;
};

export const apiListSessions = (developerId: number): Promise<DBSession[]> =>
  request(`/api/db/sessions?developerId=${developerId}`);

export const apiCreateSession = (session: Partial<DBSession>): Promise<DBSession> =>
  request('/api/db/sessions', { method: 'POST', body: session });

export const apiUpdateSession = (id: number, updates: Partial<DBSession>): Promise<void> =>
  request(`/api/db/sessions/${id}`, { method: 'PUT', body: updates });

export const apiDeleteSession = (id: number): Promise<void> =>
  request(`/api/db/sessions/${id}`, { method: 'DELETE' });

// ---------------------------------------------------------------------------
// Teams (database-backed)
// ---------------------------------------------------------------------------

export type DBTeam = {
  id: number;
  name: string;
  minPlayers: number;
  members: {
    id: number;
    teamId: number;
    userId: number;
    name: string;
    role: 'captain' | 'co-captain' | 'coach' | 'player';
    joinedAt: string;
  }[];
  createdAt: string;
};

export const apiListTeams = (): Promise<DBTeam[]> =>
  request('/api/db/teams');

export const apiCreateTeam = (name: string, userId: number, userName: string): Promise<DBTeam> =>
  request('/api/db/teams', { method: 'POST', body: { name, userId, userName } });

export const apiGetTeamForUser = (userId: number): Promise<DBTeam> =>
  request(`/api/db/teams/for-user?userId=${userId}`);

// ---------------------------------------------------------------------------
// Archives (database-backed)
// ---------------------------------------------------------------------------

export type DBArchive = {
  id: number;
  sessionId?: number;
  gameId?: number;
  developerId: number;
  developerName: string;
  sessionName: string;
  startedAt: string;
  endedAt: string;
  networkSummary?: string;
  results: {
    id: number;
    archiveId: number;
    teamId?: number;
    position: number;
    score: number;
    participants: string[];
  }[];
  createdAt: string;
};

export const apiListArchives = (developerId: number): Promise<DBArchive[]> =>
  request(`/api/db/archives?developerId=${developerId}`);

export const apiGetArchive = (id: number): Promise<DBArchive> =>
  request(`/api/db/archives/${id}`);

export const apiDeleteArchive = (id: number): Promise<void> =>
  request(`/api/db/archives/${id}`, { method: 'DELETE' });

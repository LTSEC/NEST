import { VerifiedUser } from '../auth';
import { Game } from './games';
import { getTeamById, getTeamForUser, listTeams } from './teams';

export type GameVisibility = 'public' | 'private';

export type GameSession = {
  id: string;
  gameId: string;
  gameName: string;
  developerId: string;
  developerName: string;
  types: Game['types'];
  startTime: string;
  endTime: string;
  visibility: GameVisibility;
  invitedTeamIds: string[];
  participantTeamIds: string[];
  minPlayers: number;
  status: 'scheduled' | 'running' | 'paused' | 'completed';
  infrastructureId?: number;
  infrastructureStatus?: 'creating' | 'active' | 'destroying' | 'error';
};

const seededSessions: GameSession[] = [
  {
    id: 'session-1',
    gameId: '100',
    gameName: 'Sample Red vs Blue',
    developerId: '2',
    developerName: 'Developer',
    types: ['Red vs. Blue'],
    startTime: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    endTime: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    visibility: 'public',
    invitedTeamIds: [],
    participantTeamIds: ['team-1'],
    minPlayers: 3,
    status: 'running',
    infrastructureId: 1001,
    infrastructureStatus: 'active',
  },
  {
    id: 'session-2',
    gameId: '200',
    gameName: 'Web Exploit Mini CTF',
    developerId: '3',
    developerName: 'Guest Developer',
    types: ['CTFs'],
    startTime: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    endTime: new Date(Date.now() + 40 * 60 * 1000).toISOString(),
    visibility: 'public',
    invitedTeamIds: [],
    participantTeamIds: ['team-2'],
    minPlayers: 2,
    status: 'running',
  },
  {
    id: 'session-3',
    gameId: '300',
    gameName: 'Upcoming Red v Blue',
    developerId: '2',
    developerName: 'Developer',
    types: ['Red vs. Blue'],
    startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    endTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    visibility: 'private',
    invitedTeamIds: ['team-1'],
    participantTeamIds: [],
    minPlayers: 4,
    status: 'scheduled',
  },
];

const sessionsTable: GameSession[] = [...seededSessions];

const generateId = () => `session-${Math.random().toString(16).slice(2, 10)}`;

const updateStatus = (session: GameSession): GameSession => {
    if (session.status === 'paused') return session;

  const now = Date.now();
  const start = new Date(session.startTime).getTime();
  const end = new Date(session.endTime).getTime();

  let status: GameSession['status'] = session.status;
  if (now < start) status = 'scheduled';
  else if (now >= start && now <= end) status = 'running';
  else status = 'completed';

  if (status !== session.status) {
    session.status = status;
  }

  return session;
};

const sortSessions = (sessions: GameSession[]) =>
  [...sessions].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

export const listActiveGameSessions = (options?: { publicOnly?: boolean }): GameSession[] => {
  const sessions = sessionsTable.map(updateStatus).filter((session) => session.status === 'running');
  return sortSessions(options?.publicOnly ? sessions.filter((session) => session.visibility === 'public') : sessions);
};

export const getSessionById = (sessionId: string): GameSession | undefined => {
  const session = sessionsTable.find((entry) => entry.id === sessionId);
  return session ? updateStatus(session) : undefined;
};

export const listDeveloperSessions = (developerId: VerifiedUser['id']): GameSession[] =>
  sortSessions(sessionsTable.filter((session) => session.developerId === developerId).map(updateStatus));

export const listScheduledSessionsForDeveloper = (developerId: VerifiedUser['id']): GameSession[] =>
  sortSessions(
    sessionsTable
      .filter((session) => session.developerId === developerId)
      .map(updateStatus)
      .filter((session) => session.status === 'scheduled')
  );

export const listSessionsForTeam = (teamId: string): GameSession[] =>
  sortSessions(
    sessionsTable
      .filter((session) => session.invitedTeamIds.includes(teamId) || session.participantTeamIds.includes(teamId))
      .map(updateStatus)
  );

export const listSessionsForPlayer = (userId: string): GameSession[] => {
  const team = getTeamForUser(userId);
  if (!team) return [];
  return listSessionsForTeam(team.id).filter((session) =>
    session.participantTeamIds.includes(team.id) || session.invitedTeamIds.includes(team.id)
  );
};

export const scheduleGameSession = (
  game: Game,
  host: Pick<VerifiedUser, 'id' | 'name'>,
  options: {
    startTime: string;
    endTime: string;
    visibility: GameVisibility;
    invitedTeamIds: string[];
    minPlayers: number;
    infrastructureId?: number;
    infrastructureStatus?: GameSession['infrastructureStatus'];
  }
): GameSession => {
  const newSession: GameSession = {
    id: generateId(),
    gameId: game.id,
    gameName: game.name,
    developerId: host.id,
    developerName: host.name,
    types: game.types,
    startTime: options.startTime,
    endTime: options.endTime,
    visibility: options.visibility,
    invitedTeamIds: [...new Set(options.invitedTeamIds)],
    participantTeamIds: [],
    minPlayers: Math.max(1, options.minPlayers || 1),
    status: 'scheduled',
    infrastructureId: options.infrastructureId,
    infrastructureStatus: options.infrastructureStatus,
  };

  sessionsTable.push(updateStatus(newSession));
  return newSession;
};

export const inviteTeamToSession = (sessionId: string, teamId: string): GameSession | undefined => {
  const session = sessionsTable.find((entry) => entry.id === sessionId);
  const team = getTeamById(teamId);
  if (!session || !team) return undefined;

  updateStatus(session);
  if (session.status !== 'scheduled') return session;

  session.invitedTeamIds = Array.from(new Set([...session.invitedTeamIds, teamId]));
  return session;
};

export const joinSessionAsTeam = (sessionId: string, teamId: string): GameSession | undefined => {
  const session = sessionsTable.find((entry) => entry.id === sessionId);
  const team = getTeamById(teamId);
  if (!session || !team) return undefined;

  updateStatus(session);
  if (session.status !== 'scheduled') return session;
  if (team.members.length < session.minPlayers) return session;
  if (session.visibility === 'private' && !session.invitedTeamIds.includes(teamId)) return session;

  session.participantTeamIds = Array.from(new Set([...session.participantTeamIds, teamId]));
  return session;
};

export const pauseSession = (sessionId: string): GameSession | undefined => {
  const session = sessionsTable.find((entry) => entry.id === sessionId);
  if (!session) return undefined;
  session.status = 'paused';
  return session;
};

export const resumeSession = (sessionId: string): GameSession | undefined => {
  const session = sessionsTable.find((entry) => entry.id === sessionId);
  if (!session) return undefined;
  return updateStatus(session);
};

export const attachInfrastructure = (
  sessionId: string,
  infrastructureId: number,
  status: GameSession['infrastructureStatus'] = 'creating'
): GameSession | undefined => {
  const session = sessionsTable.find((entry) => entry.id === sessionId);
  if (!session) return undefined;
  session.infrastructureId = infrastructureId;
  session.infrastructureStatus = status;
  return session;
};

export const updateInfrastructureStatus = (
  sessionId: string,
  status: GameSession['infrastructureStatus']
): GameSession | undefined => {
  const session = sessionsTable.find((entry) => entry.id === sessionId);
  if (!session) return undefined;
  session.infrastructureStatus = status;
  return session;
};

export const shutdownSession = (sessionId: string): GameSession | undefined => {
  const session = sessionsTable.find((entry) => entry.id === sessionId);
  if (!session) return undefined;
  session.status = 'completed';
  return session;
};

export const removeTeamFromSession = (sessionId: string, teamId: string): GameSession | undefined => {
  const session = sessionsTable.find((entry) => entry.id === sessionId);
  if (!session) return undefined;
  session.participantTeamIds = session.participantTeamIds.filter((id) => id !== teamId);
  session.invitedTeamIds = session.invitedTeamIds.filter((id) => id !== teamId);
  return session;
};

export const listPublicGames = (): GameSession[] =>
  sortSessions(sessionsTable.map(updateStatus).filter((session) => session.visibility === 'public'));

export const describeIncompleteSession = (session: GameSession): string | null => {
  const teamCount = session.participantTeamIds.length;
  if (session.status === 'scheduled' && teamCount === 0) {
    return 'Waiting for teams to join';
  }
  const joinedTeams = session.participantTeamIds
    .map((teamId) => getTeamById(teamId))
    .filter(Boolean)
    .map((team) => team?.name ?? 'Unknown');

  if (session.minPlayers > 0) {
    const undersized = joinedTeams.find((name) => {
      const team = listTeams().find((entry) => entry.name === name);
      return team ? team.members.length < session.minPlayers : false;
    });
    if (undersized) {
      return `Team ${undersized} does not meet the minimum player count (${session.minPlayers}).`;
    }
  }

  return null;
};

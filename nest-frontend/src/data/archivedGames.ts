import type { GameSession } from './gameSessions';
import { listTeams } from './teams';

export type ArchivedGameResult = {
  teamId: string;
  position: number;
  score: number;
  participants: string[];
};

export type ArchivedGame = {
  id: string;
  sessionId: string;
  gameId: string;
  developerId: string;
  developerName: string;
  sessionName: string;
  startedAt: string;
  endedAt: string;
  networkSummary?: string;
  results: ArchivedGameResult[];
};

const archiveTable: ArchivedGame[] = [];

const generateId = () => `archive-${Math.random().toString(16).slice(2, 10)}`;

const normalizeResults = (session: GameSession): ArchivedGameResult[] => {
  const teams = listTeams();
  return session.participantTeamIds.map((teamId, index) => {
    const team = teams.find((entry) => entry.id === teamId);
    const participants = team ? team.members.map((member) => member.name) : [];
    return {
      teamId,
      position: index + 1,
      score: 0,
      participants,
    };
  });
};

export const archiveGameSession = (session: GameSession): ArchivedGame => {
  const existing = archiveTable.find((entry) => entry.sessionId === session.id);
  const payload: ArchivedGame = {
    id: existing?.id ?? generateId(),
    sessionId: session.id,
    gameId: session.gameId,
    developerId: session.developerId,
    developerName: session.developerName,
    sessionName: session.gameName,
    startedAt: session.startTime,
    endedAt: session.endTime,
    networkSummary: existing?.networkSummary ?? 'Network summary pending.',
    results: existing?.results?.length ? existing.results : normalizeResults(session),
  };

  if (existing) {
    const index = archiveTable.findIndex((entry) => entry.id === existing.id);
    archiveTable.splice(index, 1, payload);
  } else {
    archiveTable.push(payload);
  }

  return payload;
};

export const listArchivedGamesForDeveloper = (developerId: string): ArchivedGame[] =>
  archiveTable.filter((entry) => entry.developerId === developerId);

export const getArchivedGameById = (archiveId: string): ArchivedGame | undefined =>
  archiveTable.find((entry) => entry.id === archiveId);

export const removeArchivedGame = (archiveId: string): boolean => {
  const index = archiveTable.findIndex((entry) => entry.id === archiveId);
  if (index === -1) return false;
  archiveTable.splice(index, 1);
  return true;
};

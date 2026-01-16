import { listTeams } from './teams';

export type ServiceStatus = 'up' | 'down' | 'unknown';

export type ServiceHealthEntry = {
  name: string;
  slaCount: number;
  uptimePercentage: number;
  status: ServiceStatus;
  lastTenStatuses: ServiceStatus[];
};

export type ServiceHealth = {
  sessionId: string;
  teamId: string;
  services: ServiceHealthEntry[];
};

const serviceHealthTable: ServiceHealth[] = [];

const normalizeStatuses = (statuses: ServiceStatus[]): ServiceStatus[] => {
  const safeStatuses = statuses.map((status) => (['up', 'down', 'unknown'] as const).includes(status) ? status : 'unknown');
  if (safeStatuses.length >= 10) return safeStatuses.slice(-10);
  return [...safeStatuses, ...Array(10 - safeStatuses.length).fill('unknown')];
};

const normalizeServiceEntry = (entry: ServiceHealthEntry): ServiceHealthEntry => ({
  ...entry,
  slaCount: Math.max(0, entry.slaCount),
  uptimePercentage: Math.max(0, Math.min(100, entry.uptimePercentage)),
  status: (['up', 'down', 'unknown'] as const).includes(entry.status) ? entry.status : 'unknown',
  lastTenStatuses: normalizeStatuses(entry.lastTenStatuses),
});

export const listServiceHealthTeams = (sessionId: string): { teamId: string; teamName: string }[] => {
  const teams = listTeams();
  return serviceHealthTable
    .filter((entry) => entry.sessionId === sessionId)
    .map((entry) => ({
      teamId: entry.teamId,
      teamName: teams.find((team) => team.id === entry.teamId)?.name ?? entry.teamId,
    }));
};

export const listServiceHealthForSession = (
  sessionId: string,
  teamId?: string
): ServiceHealthEntry[] => {
  const record = serviceHealthTable.find(
    (entry) => entry.sessionId === sessionId && (!teamId || entry.teamId === teamId)
  );

  if (!record) return [];

  return record.services.map(normalizeServiceEntry);
};

export const upsertServiceHealth = (sessionId: string, teamId: string, services: ServiceHealthEntry[]): ServiceHealth => {
  const normalized = services.map(normalizeServiceEntry);
  const existingIndex = serviceHealthTable.findIndex(
    (entry) => entry.sessionId === sessionId && entry.teamId === teamId
  );

  const payload: ServiceHealth = { sessionId, teamId, services: normalized };
  if (existingIndex === -1) {
    serviceHealthTable.push(payload);
  } else {
    serviceHealthTable.splice(existingIndex, 1, payload);
  }

  return payload;
};

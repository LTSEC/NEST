import { listTeams } from './teams';

export type ServiceStatus = 'up' | 'down' | 'degraded';

export type ServiceHealth = {
  sessionId: string;
  teamId: string;
  services: {
    name: string;
    slaTier: number;
    uptimePercentage: number;
    status: ServiceStatus;
  }[];
};

const sampleHealth: ServiceHealth[] = [
  {
    sessionId: 'session-1',
    teamId: 'team-1',
    services: [
      { name: 'Web', slaTier: 1, uptimePercentage: 99.1, status: 'up' },
      { name: 'DNS', slaTier: 2, uptimePercentage: 97.4, status: 'degraded' },
      { name: 'Database', slaTier: 3, uptimePercentage: 95.2, status: 'up' },
    ],
  },
  {
    sessionId: 'session-1',
    teamId: 'team-2',
    services: [
      { name: 'Web', slaTier: 1, uptimePercentage: 96.5, status: 'down' },
      { name: 'DNS', slaTier: 2, uptimePercentage: 93.3, status: 'down' },
      { name: 'Database', slaTier: 3, uptimePercentage: 98.8, status: 'up' },
    ],
  },
  {
    sessionId: 'session-2',
    teamId: 'team-2',
    services: [
      { name: 'Challenge API', slaTier: 1, uptimePercentage: 99.9, status: 'up' },
    ],
  },
];

export const listServiceHealthTeams = (sessionId: string) => {
  const teams = listTeams();
  return sampleHealth
    .filter((entry) => entry.sessionId === sessionId)
    .map((entry) => ({
      teamId: entry.teamId,
      teamName: teams.find((team) => team.id === entry.teamId)?.name ?? entry.teamId,
    }));
};

export const listServiceHealthForSession = (sessionId: string, teamId?: string): ServiceHealth['services'] => {
  const matching = sampleHealth.find((entry) => entry.sessionId === sessionId && (!teamId || entry.teamId === teamId));
  return matching?.services ?? [];
};

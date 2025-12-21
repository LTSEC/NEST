import { Game } from './games';

export type HostedGameStatus = {
  id: number;
  name: string;
  status: string;
  updatedAt?: string;
  startedAt?: string;
  gameId: string;
};

type BackendGameStatus = {
  ID: number;
  Name: string;
  Status: string;
  UpdatedAt?: string;
  StartedAt?: string;
};

type CyberGamePayload = {
  networks: { name: string; cidr: string }[];
  devices: {
    name: string;
    type: string;
    os: { id: number; name: string };
    hostId?: number | null;
    interfaces?: Record<string, string>;
    router?: string;
    interface?: string;
    segment?: string;
    dhcp?: boolean;
    ip?: string;
    services: Record<string, number>;
    ldapZone?: string;
  }[];
  blackteamServices: { name: string; templateId: number; hostId: number; ip: string }[];
  applications: { name: string; servers: string[]; services: string[]; color: string }[];
  ldapZones: {
    name: string;
    server: string;
    users: { username: string; password: string }[];
    connectedServers: string[];
  }[];
};

const buildTeamLdapZones = (teamCount: number): CyberGamePayload['ldapZones'] => {
  if (!Number.isFinite(teamCount) || teamCount <= 0) return [];
  return Array.from({ length: Math.floor(teamCount) }, (_, index) => {
    const teamNumber = index + 1;
    return {
      name: `Team ${teamNumber}`,
      server: `team${teamNumber}.ldap.local`,
      users: [
        { username: `team${teamNumber}-captain`, password: 'changeme!' },
        { username: `team${teamNumber}-member`, password: 'changeme!' },
      ],
      connectedServers: [],
    };
  });
};

const buildCyberGamePayload = (game: Game, teamCount?: number): CyberGamePayload => {
  const hasRvb = game.types.includes('Red vs. Blue');
  const safeTeamCount = hasRvb && teamCount ? Math.max(1, Math.floor(teamCount)) : 0;

  return {
    networks: [],
    devices: [],
    blackteamServices: game.rvbServices.map((service, index) => ({
      name: service,
      templateId: index + 1,
      hostId: index + 1,
      ip: `10.0.0.${index + 10}`,
    })),
    applications: game.types.map((type, index) => ({
      name: `${game.name} - ${type}`,
      servers: [],
      services: [],
      color: ['#E11D48', '#2563EB', '#10B981'][index % 3],
    })),
    ldapZones: hasRvb ? buildTeamLdapZones(safeTeamCount || game.teamCount || 0) : [],
  };
};

export const hostGameInstance = async (
  game: Game,
  options?: { teamCount?: number }
): Promise<HostedGameStatus> => {
  const payload = buildCyberGamePayload(game, options?.teamCount);
  const response = await fetch('http://localhost:4545/api/games', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = 'Failed to host game.';
    try {
      const body = await response.json();
      if (body?.error) message = body.error as string;
    } catch (error) {
      // ignore parse errors and fallback to default message
    }
    throw new Error(message);
  }

  const data = (await response.json()) as BackendGameStatus;

  return {
    id: data.ID,
    name: data.Name,
    status: data.Status,
    updatedAt: data.UpdatedAt,
    startedAt: data.StartedAt,
    gameId: game.id,
  };
};

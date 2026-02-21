import { VerifiedUser } from '../auth';

export type GameType = 'Injects' | 'CTFs' | 'Red vs. Blue';
export type RvbService = 'Scoring Engine' | 'DNS' | 'CDN' | 'CA';

export type Credential = {
  username: string;
  password: string;
};

export type Game = {
  id: string;
  name: string;
  developerId: string;
  types: GameType[];
  rvbServices: RvbService[];
  credentials: Credential[];
  teamCount: number;
  createdAt: string;
  presetId?: string;
  blackTeamCidr?: string;
  /** Scoring check interval in seconds (15–300). Only relevant when Scoring Engine is enabled. */
  scoringCheckInterval?: number;
};

const allowedGameTypes: GameType[] = ['Injects', 'CTFs', 'Red vs. Blue'];
const allowedRvbServices: RvbService[] = ['Scoring Engine', 'DNS', 'CDN', 'CA'];

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `game-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

const gamesTable: Game[] = [];

const isValidGameType = (type: string): type is GameType => allowedGameTypes.includes(type as GameType);
const isValidService = (service: string): service is RvbService => allowedRvbServices.includes(service as RvbService);

export const listGamesForDeveloper = (developerId: VerifiedUser['id']): Game[] =>
  gamesTable.filter((game) => game.developerId === developerId);

export const getGameById = (gameId: string): Game | undefined => gamesTable.find((game) => game.id === gameId);

export const updateGame = (gameId: string, developerId: VerifiedUser['id'], updates: Partial<Omit<Game, 'id' | 'developerId' | 'createdAt'>>): Game => {
  const game = gamesTable.find((entry) => entry.id === gameId && entry.developerId === developerId);
  if (!game) {
    throw new Error('Game not found');
  }

  const trimmedName = updates.name?.trim() ?? game.name;
  if (!trimmedName) {
    throw new Error('Game name is required');
  }

  const types = updates.types?.filter((type) => isValidGameType(type)) ?? game.types;
  if (!types.length) {
    throw new Error('At least one game type is required');
  }

  const includesRvb = types.includes('Red vs. Blue');
  const services = includesRvb
    ? (updates.rvbServices ?? game.rvbServices).filter((service) => isValidService(service))
    : [];
  const teamCount = includesRvb ? Math.max(0, updates.teamCount ?? game.teamCount ?? 0) : 0;
  const credentials = includesRvb ? updates.credentials ?? game.credentials : [];

  game.name = trimmedName;
  game.types = types;
  game.rvbServices = services;
  game.credentials = credentials;
  game.teamCount = teamCount;
  if ('presetId' in updates) {
    game.presetId = updates.presetId;
  }
  if ('blackTeamCidr' in updates) {
    game.blackTeamCidr = updates.blackTeamCidr;
  }
  if ('scoringCheckInterval' in updates) {
    game.scoringCheckInterval = updates.scoringCheckInterval;
  }

  return game;
};

export const createGame = (params: {
  name: string;
  developerId: VerifiedUser['id'];
  types: GameType[];
  rvbServices?: RvbService[];
  credentials?: Credential[];
  teamCount?: number;
  presetId?: string;
  blackTeamCidr?: string;
  scoringCheckInterval?: number;
}): Game => {
  const trimmedName = params.name.trim();
  if (!trimmedName) {
    throw new Error('Game name is required');
  }

  const types = params.types.filter((type) => isValidGameType(type));
  if (!types.length) {
    throw new Error('At least one game type is required');
  }

  const includesRvb = types.includes('Red vs. Blue');
  const services = includesRvb
    ? (params.rvbServices ?? []).filter((service) => isValidService(service))
    : [];
  const teamCount = includesRvb ? Math.max(0, params.teamCount ?? 0) : 0;
  const credentials = includesRvb
    ? params.credentials ?? [{ username: 'root', password: 'changeme' }]
    : [];

  const newGame: Game = {
    id: generateId(),
    name: trimmedName,
    developerId: params.developerId,
    types,
    rvbServices: services,
    credentials,
    teamCount,
    createdAt: new Date().toISOString(),
    presetId: params.presetId,
    blackTeamCidr: params.blackTeamCidr,
    scoringCheckInterval: params.scoringCheckInterval,
  };

  gamesTable.unshift(newGame);
  return newGame;
};

export const deleteGame = (gameId: string, developerId: VerifiedUser['id']): boolean => {
  const index = gamesTable.findIndex((game) => game.id === gameId && game.developerId === developerId);
  if (index === -1) return false;

  gamesTable.splice(index, 1);
  return true;
};

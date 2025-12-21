import { VerifiedUser } from '../auth';

export type GameType = 'Injects' | 'CTFs' | 'Red vs. Blue';
export type RvbService = 'Scoring Engine' | 'DNS' | 'CDN' | 'CA';

export type Game = {
  id: string;
  name: string;
  developerId: string;
  types: GameType[];
  rvbServices: RvbService[];
  teamCount: number;
  createdAt: string;
};

const allowedGameTypes: GameType[] = ['Injects', 'CTFs', 'Red vs. Blue'];
const allowedRvbServices: RvbService[] = ['Scoring Engine', 'DNS', 'CDN', 'CA'];

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `game-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

const seededGames: Game[] = [
  {
    id: '100',
    name: 'Sample Red vs Blue',
    developerId: '2',
    types: ['Red vs. Blue'],
    rvbServices: ['Scoring Engine', 'DNS'],
    teamCount: 4,
    createdAt: new Date().toISOString(),
  },
];

const gamesTable: Game[] = [...seededGames];

const isValidGameType = (type: string): type is GameType => allowedGameTypes.includes(type as GameType);
const isValidService = (service: string): service is RvbService => allowedRvbServices.includes(service as RvbService);

export const listGamesForDeveloper = (developerId: VerifiedUser['id']): Game[] =>
  gamesTable.filter((game) => game.developerId === developerId);

export const getGameById = (gameId: string): Game | undefined => gamesTable.find((game) => game.id === gameId);

export const createGame = (params: {
  name: string;
  developerId: VerifiedUser['id'];
  types: GameType[];
  rvbServices?: RvbService[];
  teamCount?: number;
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

  const newGame: Game = {
    id: generateId(),
    name: trimmedName,
    developerId: params.developerId,
    types,
    rvbServices: services,
    teamCount,
    createdAt: new Date().toISOString(),
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

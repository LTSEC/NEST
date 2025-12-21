import { listTeams } from './teams';

export type PreviousGameResult = {
  teamId: string;
  position: number;
  score: number;
  participants: string[];
};

export type PreviousGame = {
  id: string;
  gameId: string;
  sessionName: string;
  startedAt: string;
  endedAt: string;
  networkSummary: string;
  results: PreviousGameResult[];
};

const historyTable: PreviousGame[] = [
  {
    id: 'history-1',
    gameId: '100',
    sessionName: 'Sample Red vs Blue - Week 1',
    startedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    endedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
    networkSummary: 'Multi-team network with 6 routers, 14 hosts, and isolated VPN spokes.',
    results: [
      {
        teamId: 'team-1',
        position: 1,
        score: 1890,
        participants: ['Test', 'Casey', 'Robin'],
      },
      {
        teamId: 'team-2',
        position: 2,
        score: 1320,
        participants: ['Jordan', 'Avery'],
      },
    ],
  },
];

export const listPreviousGamesForGame = (gameId: string): PreviousGame[] => {
  const teams = listTeams();
  return historyTable
    .filter((record) => record.gameId === gameId)
    .map((record) => ({
      ...record,
      results: record.results.map((result) => ({
        ...result,
        participants: result.participants.length
          ? result.participants
          : teams.find((team) => team.id === result.teamId)?.members.map((member) => member.name) ?? [],
      })),
    }));
};

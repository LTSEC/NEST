import { VerifiedUser } from '../auth';

export type TeamRole = 'captain' | 'co-captain' | 'coach' | 'player';

export type TeamMember = {
  id: string;
  name: string;
  role: TeamRole;
};

export type Team = {
  id: string;
  name: string;
  members: TeamMember[];
  minPlayers: number;
};

export type TeamInvitation = {
  id: string;
  teamId: string;
  userId: string;
  invitedBy: string;
};

const seededTeams: Team[] = [
  {
    id: 'team-1',
    name: 'Blue Raptors',
    minPlayers: 3,
    members: [
      { id: '1', name: 'Test', role: 'captain' },
      { id: '5', name: 'Casey', role: 'co-captain' },
      { id: '6', name: 'Robin', role: 'coach' },
      { id: '7', name: 'Quinn', role: 'player' },
      { id: '8', name: 'Taylor', role: 'player' },
    ],
  },
  {
    id: 'team-2',
    name: 'Signal Owls',
    minPlayers: 2,
    members: [
      { id: '9', name: 'Jordan', role: 'captain' },
      { id: '10', name: 'Avery', role: 'player' },
      { id: '11', name: 'Kai', role: 'player' },
    ],
  },
];

const seededInvitations: TeamInvitation[] = [
  { id: 'invite-1', teamId: 'team-2', userId: '1', invitedBy: 'Jordan' },
  { id: 'invite-2', teamId: 'team-3', userId: '1', invitedBy: 'Scheduler' },
];

const teamsTable: Team[] = [...seededTeams];
const invitationsTable: TeamInvitation[] = [...seededInvitations];

const generateId = (prefix: string) => `${prefix}-${Math.random().toString(16).slice(2, 10)}`;

const findTeamById = (teamId: string): Team | undefined => teamsTable.find((team) => team.id === teamId);

export const listTeams = (): Team[] => [...teamsTable];

export const getTeamForUser = (userId: VerifiedUser['id']): Team | undefined =>
  teamsTable.find((team) => team.members.some((member) => member.id === userId));

export const listTeamInvitationsForUser = (userId: VerifiedUser['id']): TeamInvitation[] =>
  invitationsTable.filter((invite) => invite.userId === userId);

export const acceptTeamInvitation = (invitationId: string, user: VerifiedUser): Team | null => {
  const invitationIndex = invitationsTable.findIndex((invite) => invite.id === invitationId);
  if (invitationIndex === -1) return null;

  const invitation = invitationsTable[invitationIndex];
  const targetTeam = findTeamById(invitation.teamId);
  if (!targetTeam) return null;

  const alreadyMember = targetTeam.members.some((member) => member.id === user.id);
  if (!alreadyMember) {
    targetTeam.members.push({ id: user.id, name: user.name, role: 'player' });
  }

  invitationsTable.splice(invitationIndex, 1);
  return targetTeam;
};

export const declineTeamInvitation = (invitationId: string): boolean => {
  const invitationIndex = invitationsTable.findIndex((invite) => invite.id === invitationId);
  if (invitationIndex === -1) return false;
  invitationsTable.splice(invitationIndex, 1);
  return true;
};

export const createTeamForUser = (name: string, user: VerifiedUser): Team => {
  const trimmedName = name.trim();
  const safeName = trimmedName || `${user.name}'s Team`;
  const newTeam: Team = {
    id: generateId('team'),
    name: safeName,
    minPlayers: 3,
    members: [{ id: user.id, name: user.name, role: 'captain' }],
  };

  teamsTable.push(newTeam);

  for (let index = invitationsTable.length - 1; index >= 0; index -= 1) {
    if (invitationsTable[index].userId === user.id) {
      invitationsTable.splice(index, 1);
    }
  }

  return newTeam;
};

export const leaveTeam = (teamId: string, userId: VerifiedUser['id']): boolean => {
  const team = findTeamById(teamId);
  if (!team) return false;

  const memberIndex = team.members.findIndex((member) => member.id === userId);
  if (memberIndex === -1) return false;

  team.members.splice(memberIndex, 1);
  return true;
};

export const removeTeamMember = (teamId: string, memberId: string): boolean => {
  const team = findTeamById(teamId);
  if (!team) return false;

  const memberIndex = team.members.findIndex((member) => member.id === memberId);
  if (memberIndex === -1) return false;

  team.members.splice(memberIndex, 1);
  return true;
};

export const updateTeamMemberRole = (
  teamId: string,
  memberId: string,
  role: TeamRole
): Team | undefined => {
  const team = findTeamById(teamId);
  if (!team) return undefined;

  if (['captain', 'coach', 'co-captain'].includes(role)) {
    team.members = team.members.map((member) => {
      if (member.id === memberId) return { ...member, role };
      if (role === 'captain' && member.role === 'captain') return { ...member, role: 'player' };
      if (role === 'coach' && member.role === 'coach') return { ...member, role: 'player' };
      if (role === 'co-captain' && member.role === 'co-captain') return { ...member, role: 'player' };
      return member;
    });
  } else {
    team.members = team.members.map((member) => (member.id === memberId ? { ...member, role } : member));
  }

  return team;
};

export const transferCaptaincy = (teamId: string, fromId: string, toId: string): Team | undefined => {
  const team = findTeamById(teamId);
  if (!team) return undefined;

  const fromMember = team.members.find((member) => member.id === fromId && member.role === 'captain');
  const toMember = team.members.find((member) => member.id === toId);
  if (!fromMember || !toMember) return team;

  team.members = team.members.map((member) => {
    if (member.id === fromId) return { ...member, role: 'player' };
    if (member.id === toId) return { ...member, role: 'captain' };
    if (member.role === 'captain') return { ...member, role: 'player' };
    return member;
  });

  return team;
};

export const renameTeam = (teamId: string, name: string): Team | undefined => {
  const team = findTeamById(teamId);
  if (!team) return undefined;
  const safeName = name.trim();
  team.name = safeName || team.name;
  return team;
};

export const invitePlayerToTeam = (teamId: string, userId: string, invitedBy: string): TeamInvitation => {
  const newInvite: TeamInvitation = {
    id: generateId('invite'),
    teamId,
    userId,
    invitedBy,
  };
  invitationsTable.push(newInvite);
  return newInvite;
};

export const getTeamById = (teamId: string): Team | undefined => findTeamById(teamId);

import React, { useEffect, useMemo, useState } from 'react';
import AppNav from '../components/AppNav';
import NavBar from '../components/NavBar';
import { listScheduledSessionsForDeveloper } from '../data/gameSessions';
import {
  Team,
  TeamInvitation,
  TeamMember,
  acceptTeamInvitation,
  createTeamForUser,
  declineTeamInvitation,
  getTeamForUser,
  invitePlayerToTeam,
  leaveTeam,
  listTeamInvitationsForUser,
  listTeams,
  removeTeamMember,
  renameTeam,
  transferCaptaincy,
  updateTeamMemberRole,
} from '../data/teams';
import { inviteTeamToSession } from '../data/gameSessions';
import { useAuth } from '../providers/AuthProvider';

const TeamList: React.FC = () => {
  const { user, logout } = useAuth();
  const isDeveloper = user?.role === 'developer';

  const [teams, setTeams] = useState<Team[]>(listTeams());
  const [invites, setInvites] = useState<TeamInvitation[]>(user ? listTeamInvitationsForUser(user.id) : []);
  const [teamNameInput, setTeamNameInput] = useState('');
  const [renameInput, setRenameInput] = useState('');
  const [pendingLeave, setPendingLeave] = useState<string | null>(null);
  const [inviteeInput, setInviteeInput] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const myTeam = useMemo(() => (user ? getTeamForUser(user.id) : undefined), [user, teams]);
  const isCaptain = myTeam?.members.some((member) => member.id === user?.id && member.role === 'captain');

  const developerSessions = useMemo(
    () => (isDeveloper && user ? listScheduledSessionsForDeveloper(user.id) : []),
    [isDeveloper, user]
  );

  useEffect(() => {
    setTeams(listTeams());
    if (user) setInvites(listTeamInvitationsForUser(user.id));
    setRenameInput(myTeam?.name ?? '');
  }, [myTeam?.name, user]);

  const refresh = () => {
    setTeams(listTeams());
    if (user) setInvites(listTeamInvitationsForUser(user.id));
  };

  const handleCreateTeam = () => {
    if (!user) return;
    createTeamForUser(teamNameInput || `${user.name}'s Team`, user);
    setTeamNameInput('');
    refresh();
  };

  const handleAcceptInvite = (inviteId: string) => {
    if (!user) return;
    acceptTeamInvitation(inviteId, user);
    refresh();
  };

  const handleDeclineInvite = (inviteId: string) => {
    declineTeamInvitation(inviteId);
    refresh();
  };

  const handleLeaveTeam = (teamId: string) => {
    if (!user) return;
    if (pendingLeave === teamId) {
      leaveTeam(teamId, user.id);
      setPendingLeave(null);
      refresh();
    } else {
      setPendingLeave(teamId);
    }
  };

  const handleRoleChange = (teamId: string, memberId: string, role: TeamMember['role']) => {
    updateTeamMemberRole(teamId, memberId, role);
    refresh();
  };

  const handleTransferCaptain = (teamId: string, toId: string) => {
    if (!user) return;
    transferCaptaincy(teamId, user.id, toId);
    refresh();
  };

  const handleKickMember = (teamId: string, memberId: string) => {
    removeTeamMember(teamId, memberId);
    refresh();
  };

  const handleRenameTeam = (teamId: string) => {
    renameTeam(teamId, renameInput || 'Updated Team');
    setRenameInput('');
    refresh();
  };

  const handleInvitePlayer = (teamId: string) => {
    if (!inviteeInput.trim()) return;
    invitePlayerToTeam(teamId, inviteeInput.trim(), user?.name ?? 'Captain');
    setInviteeInput('');
    setMessage('Invitation sent');
  };

  const handleInviteTeamToSession = (teamId: string, sessionId: string) => {
    inviteTeamToSession(sessionId, teamId);
    setMessage('Team invited to scheduled game');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {isDeveloper ? <NavBar role="developer" userName={user?.name} onLogout={logout} /> : <AppNav />}
      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Teams</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{isDeveloper ? 'Team List' : 'My Team'}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isDeveloper
              ? 'Invite player teams to upcoming games before they start.'
              : 'Manage your invitations, membership, and roles.'}
          </p>
          {message && (
            <p className="animate-fade-in rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              {message}
            </p>
          )}
        </header>

        {isDeveloper && (
          <section className="grid gap-4 md:grid-cols-2">
            {teams.map((team) => (
              <article key={team.id} className="rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:shadow-black/20">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{team.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{team.members.length} players</p>
                  </div>
                  <span className="text-[11px] font-semibold uppercase text-slate-400 dark:text-slate-500">Min {team.minPlayers}</span>
                </div>

                <ul className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  {team.members.map((member) => (
                    <li key={member.id} className="flex items-center justify-between gap-2">
                      <span>
                        {member.name} — <span className="font-semibold text-slate-900 dark:text-white">{member.role}</span>
                      </span>
                    </li>
                  ))}
                </ul>

                {developerSessions.length > 0 && (
                  <div className="mt-4 space-y-2 text-xs">
                    <p className="font-semibold text-slate-900 dark:text-white">Invite to scheduled games</p>
                    {developerSessions.map((session) => (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => handleInviteTeamToSession(team.id, session.id)}
                        className="flex w-full items-center justify-between rounded-xl bg-indigo-50 px-3 py-2 text-left font-semibold text-indigo-600 transition-colors hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20"
                      >
                        <span>{session.gameName}</span>
                        <span className="text-[11px] uppercase text-indigo-400 dark:text-indigo-500">Starts {new Date(session.startTime).toLocaleTimeString()}</span>
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </section>
        )}

        {!isDeveloper && (
          <section className="space-y-6">
            {!myTeam && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <p className="font-semibold text-slate-900 dark:text-white">You are not in a team</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Join invitations below or create a new roster.</p>

                <div className="mt-4 space-y-2 text-sm">
                  {invites.map((invite) => {
                    const targetTeam = teams.find((team) => team.id === invite.teamId);
                    const teamName = targetTeam?.name ?? invite.teamId;
                    return (
                      <div key={invite.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">
                        <span className="text-slate-700 dark:text-slate-300">
                          Invite to join <span className="font-semibold">{teamName}</span> from {invite.invitedBy}
                        </span>
                        <div className="flex gap-2 text-xs font-semibold">
                          <button
                            type="button"
                            onClick={() => handleAcceptInvite(invite.id)}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-white shadow-sm transition-colors hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeclineInvite(invite.id)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {!invites.length && (
                    <p className="text-xs text-slate-400 dark:text-slate-500">No invitations at the moment.</p>
                  )}
                </div>

                <div className="mt-6 space-y-2">
                  <label className="text-sm font-semibold text-slate-900 dark:text-white" htmlFor="team-name-create">
                    Create a team
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      id="team-name-create"
                      value={teamNameInput}
                      onChange={(event) => setTeamNameInput(event.target.value)}
                      placeholder="Team name"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:ring-indigo-500/20"
                    />
                    <button
                      type="button"
                      onClick={handleCreateTeam}
                      className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                    >
                      Create
                    </button>
                  </div>
                </div>
              </div>
            )}

            {myTeam && (
              <article className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Current team</p>
                    <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{myTeam.name}</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => handleLeaveTeam(myTeam.id)}
                      className={`rounded-lg px-3 py-1.5 transition-all ${
                        pendingLeave === myTeam.id
                          ? 'bg-red-600 text-white shadow-sm'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                      }`}
                    >
                      {pendingLeave === myTeam.id ? 'Click again to confirm leave' : 'Leave team'}
                    </button>
                    {isCaptain && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleRenameTeam(myTeam.id)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                          Rename
                        </button>
                        <input
                          value={renameInput}
                          onChange={(event) => setRenameInput(event.target.value)}
                          placeholder="New team name"
                          className="w-40 rounded-lg border border-slate-200 px-3 py-1.5 text-xs shadow-sm focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                        />
                        <div className="flex items-center gap-2">
                          <input
                            value={inviteeInput}
                            onChange={(event) => setInviteeInput(event.target.value)}
                            placeholder="Player ID to invite"
                            className="w-40 rounded-lg border border-slate-200 px-3 py-1.5 text-xs shadow-sm focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleInvitePlayer(myTeam.id)}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                          >
                            Invite
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </header>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {myTeam.members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800"
                    >
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{member.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{member.role}</p>
                      </div>
                      {isCaptain && user && member.id !== user.id && (
                        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                          <select
                            value={member.role}
                            onChange={(event) => handleRoleChange(myTeam.id, member.id, event.target.value as TeamMember['role'])}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          >
                            <option value="player">Player</option>
                            <option value="co-captain">Co-captain</option>
                            <option value="coach">Coach</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => handleTransferCaptain(myTeam.id, member.id)}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            Make captain
                          </button>
                          <button
                            type="button"
                            onClick={() => handleKickMember(myTeam.id, member.id)}
                            className="rounded-lg bg-red-50 px-2 py-1 text-red-600 transition-colors hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            )}
          </section>
        )}
      </main>
    </div>
  );
};

export default TeamList;

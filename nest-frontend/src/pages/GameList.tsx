import React, { useMemo, useState } from 'react';
import AppNav from '../components/AppNav';
import NavBar from '../components/NavBar';
import {
  GameSession,
  joinSessionAsTeam,
  listActiveGameSessions,
  listPublicGames,
  listSessionsForPlayer,
} from '../data/gameSessions';
import { getTeamForUser } from '../data/teams';
import { useAuth } from '../providers/AuthProvider';
import { useNavigate } from 'react-router-dom';

const formatRange = (session: GameSession) =>
  `${new Date(session.startTime).toLocaleString()} — ${new Date(session.endTime).toLocaleString()}`;

const GameList: React.FC = () => {
  const { user, logout } = useAuth();
  const isDeveloper = user?.role === 'developer';
  const navigate = useNavigate();
  const playerTeam = user && !isDeveloper ? getTeamForUser(user.id) : undefined;

  const runningSessions = useMemo(
    () => listActiveGameSessions({ publicOnly: !isDeveloper }),
    [isDeveloper]
  );

  const publicSessions = useMemo(() => listPublicGames(), []);
  const mySessions = useMemo(() => (user && !isDeveloper ? listSessionsForPlayer(user.id) : []), [isDeveloper, user]);
  const [activePlayerTab, setActivePlayerTab] = useState<'public' | 'my'>('public');

  const handleJoin = (session: GameSession) => {
    if (!playerTeam) return;
    joinSessionAsTeam(session.id, playerTeam.id);
    navigate(`/games/${session.id}`);
  };

  const renderSessionCard = (session: GameSession, showJoin: boolean) => {
    const canJoin = playerTeam && playerTeam.members.length >= session.minPlayers;
    const alreadyJoined = playerTeam && session.participantTeamIds.includes(playerTeam.id);
    return (
      <article
        key={session.id}
        className="flex flex-col gap-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">{session.gameName}</p>
            <p className="text-xs text-slate-500">Developer: {session.developerName}</p>
            <p className="text-xs text-slate-500">{formatRange(session)}</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
            {session.status}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {session.types.map((type) => (
            <span key={type} className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
              {type}
            </span>
          ))}
          <span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-700">{session.visibility}</span>
        </div>

        {showJoin && playerTeam && (
          <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
            <span>
              Team {playerTeam.name} · {playerTeam.members.length} members · min {session.minPlayers} required
            </span>
            <button
              type="button"
              disabled={!canJoin || alreadyJoined}
              onClick={() => handleJoin(session)}
              className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {alreadyJoined ? 'Joined' : 'Join game'}
            </button>
          </div>
        )}

        {showJoin && !playerTeam && (
          <p className="text-xs text-red-600">Join or create a team to participate in games.</p>
        )}
      </article>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {isDeveloper ? <NavBar role="developer" userName={user?.name} onLogout={logout} /> : <AppNav />}
      <main className="mx-auto max-w-6xl p-6 space-y-6">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Game List</p>
          <h1 className="text-2xl font-bold text-slate-900">
            {isDeveloper ? 'Active sessions from all developers' : 'Explore live competitions'}
          </h1>
          <p className="text-sm text-slate-600">
            {isDeveloper
              ? 'Monitor what is running right now and who is hosting.'
              : 'Join public games or review the matches your team is in.'}
          </p>
        </header>

        {isDeveloper && (
          <section className="space-y-3">
            <p className="text-sm font-semibold text-slate-800">Running games</p>
            <div className="grid gap-3 md:grid-cols-2">
              {runningSessions.map((session) => (
                <div key={session.id} className="space-y-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                  {renderSessionCard(session, false)}
                  <button
                    type="button"
                    onClick={() => navigate(`/games/${session.id}`)}
                    className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
                  >
                    View game
                  </button>
                </div>
              ))}
            </div>
            {!runningSessions.length && (
              <div className="rounded-xl bg-white p-4 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
                No games are running at the moment.
              </div>
            )}
          </section>
        )}

        {!isDeveloper && (
          <section className="space-y-6">
            <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-800">
              <button
                type="button"
                onClick={() => setActivePlayerTab('public')}
                className={`rounded-full px-4 py-2 ring-1 transition ${
                  activePlayerTab === 'public'
                    ? 'bg-indigo-600 text-white ring-indigo-500'
                    : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                Public games
              </button>
              <button
                type="button"
                onClick={() => setActivePlayerTab('my')}
                className={`rounded-full px-4 py-2 ring-1 transition ${
                  activePlayerTab === 'my'
                    ? 'bg-indigo-600 text-white ring-indigo-500'
                    : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                My games
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {activePlayerTab === 'public' && publicSessions.map((session) => renderSessionCard(session, true))}
              {activePlayerTab === 'public' && !publicSessions.length && (
                <div className="rounded-xl bg-white p-4 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
                  No public games are available right now.
                </div>
              )}
              {activePlayerTab === 'my' &&
                mySessions.map((session) => (
                  <article
                    key={session.id}
                    className="flex flex-col gap-2 rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200"
                  >
                    {renderSessionCard(session, false)}
                    <button
                      type="button"
                      onClick={() => navigate(`/games/${session.id}`)}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
                    >
                      View details
                    </button>
                  </article>
                ))}

              {activePlayerTab === 'my' && !mySessions.length && (
                <div className="rounded-xl bg-white p-4 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
                  Your team has not joined any games yet.
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default GameList;

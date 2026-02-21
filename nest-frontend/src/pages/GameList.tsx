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
        className="flex flex-col gap-2 rounded-xl bg-white dark:bg-slate-900 p-4 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{session.gameName}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Developer: {session.developerName}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{formatRange(session)}</p>
          </div>
          <span className="rounded-full bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-100 dark:ring-emerald-500/30">
            {session.status}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {session.types.map((type) => (
            <span key={type} className="rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-1 text-slate-700 dark:text-slate-300">
              {type}
            </span>
          ))}
          <span className="rounded-full bg-indigo-50 dark:bg-indigo-500/20 px-2 py-1 text-indigo-700 dark:text-indigo-300">{session.visibility}</span>
        </div>

        {showJoin && playerTeam && (
          <div className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
            <span>
              Team {playerTeam.name} · {playerTeam.members.length} members · min {session.minPlayers} required
            </span>
            <button
              type="button"
              disabled={!canJoin || alreadyJoined}
              onClick={() => handleJoin(session)}
              className="rounded-lg bg-indigo-600 dark:bg-indigo-500 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 dark:hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {alreadyJoined ? 'Joined' : 'Join game'}
            </button>
          </div>
        )}

        {showJoin && !playerTeam && (
          <p className="text-xs text-red-600 dark:text-red-400">Join or create a team to participate in games.</p>
        )}
      </article>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {isDeveloper ? <NavBar role="developer" userName={user?.name} onLogout={logout} /> : <AppNav />}
      <main className="mx-auto max-w-6xl p-6 space-y-6">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">Game List</p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {isDeveloper ? 'Active sessions from all developers' : 'Explore live competitions'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {isDeveloper
              ? 'Monitor what is running right now and who is hosting.'
              : 'Join public games or review the matches your team is in.'}
          </p>
        </header>

        {isDeveloper && (
          <section className="space-y-3">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Running games</p>
            <div className="grid gap-3 md:grid-cols-2">
              {runningSessions.map((session) => (
                <div key={session.id} className="space-y-2 rounded-xl bg-white dark:bg-slate-900 p-4 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
                  {renderSessionCard(session, false)}
                  <button
                    type="button"
                    onClick={() => navigate(`/games/${session.id}`)}
                    className="w-full rounded-lg bg-indigo-600 dark:bg-indigo-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 dark:hover:bg-indigo-400"
                  >
                    View game
                  </button>
                </div>
              ))}
            </div>
            {!runningSessions.length && (
              <div className="rounded-xl bg-white dark:bg-slate-900 p-4 text-sm text-slate-600 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
                No games are running at the moment.
              </div>
            )}
          </section>
        )}

        {!isDeveloper && (
          <section className="space-y-6">
            <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <button
                type="button"
                onClick={() => setActivePlayerTab('public')}
                className={`rounded-full px-4 py-2 ring-1 transition ${
                  activePlayerTab === 'public'
                    ? 'bg-indigo-600 dark:bg-indigo-500 text-white ring-indigo-500 dark:ring-indigo-400'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                Public games
              </button>
              <button
                type="button"
                onClick={() => setActivePlayerTab('my')}
                className={`rounded-full px-4 py-2 ring-1 transition ${
                  activePlayerTab === 'my'
                    ? 'bg-indigo-600 dark:bg-indigo-500 text-white ring-indigo-500 dark:ring-indigo-400'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                My games
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {activePlayerTab === 'public' && publicSessions.map((session) => renderSessionCard(session, true))}
              {activePlayerTab === 'public' && !publicSessions.length && (
                <div className="rounded-xl bg-white dark:bg-slate-900 p-4 text-sm text-slate-600 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
                  No public games are available right now.
                </div>
              )}
              {activePlayerTab === 'my' &&
                mySessions.map((session) => (
                  <article
                    key={session.id}
                    className="flex flex-col gap-2 rounded-xl bg-white dark:bg-slate-900 p-4 text-left shadow-sm ring-1 ring-slate-200 dark:ring-slate-700"
                  >
                    {renderSessionCard(session, false)}
                    <button
                      type="button"
                      onClick={() => navigate(`/games/${session.id}`)}
                      className="rounded-lg bg-indigo-600 dark:bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 dark:hover:bg-indigo-400"
                    >
                      View details
                    </button>
                  </article>
                ))}

              {activePlayerTab === 'my' && !mySessions.length && (
                <div className="rounded-xl bg-white dark:bg-slate-900 p-4 text-sm text-slate-600 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
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

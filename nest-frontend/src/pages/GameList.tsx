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
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:shadow-black/20"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">{session.gameName}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Developer: {session.developerName}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{formatRange(session)}</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            {session.status}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
          {session.types.map((type) => (
            <span key={type} className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {type}
            </span>
          ))}
          <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">{session.visibility}</span>
        </div>

        {showJoin && playerTeam && (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            <span>
              Team {playerTeam.name} · {playerTeam.members.length} members · min {session.minPlayers} required
            </span>
            <button
              type="button"
              disabled={!canJoin || alreadyJoined}
              onClick={() => handleJoin(session)}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {alreadyJoined ? 'Joined' : 'Join game'}
            </button>
          </div>
        )}

        {showJoin && !playerTeam && (
          <p className="text-xs text-red-500 dark:text-red-400">Join or create a team to participate in games.</p>
        )}
      </article>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {isDeveloper ? <NavBar role="developer" userName={user?.name} onLogout={logout} /> : <AppNav />}
      <main className="mx-auto max-w-6xl px-6 py-10 space-y-8">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Game List</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {isDeveloper ? 'Active sessions from all developers' : 'Explore live competitions'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isDeveloper
              ? 'Monitor what is running right now and who is hosting.'
              : 'Join public games or review the matches your team is in.'}
          </p>
        </header>

        {isDeveloper && (
          <section className="space-y-4">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Running games</p>
            <div className="grid gap-4 md:grid-cols-2">
              {runningSessions.map((session) => (
                <div key={session.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  {renderSessionCard(session, false)}
                  <button
                    type="button"
                    onClick={() => navigate(`/games/${session.id}`)}
                    className="w-full rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 hover:shadow-md hover:shadow-indigo-500/25 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                  >
                    View game
                  </button>
                </div>
              ))}
            </div>
            {!runningSessions.length && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                No games are running at the moment.
              </div>
            )}
          </section>
        )}

        {!isDeveloper && (
          <section className="space-y-6">
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setActivePlayerTab('public')}
                className={`flex-1 rounded-lg px-4 py-2 transition-all ${
                  activePlayerTab === 'public'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Public games
              </button>
              <button
                type="button"
                onClick={() => setActivePlayerTab('my')}
                className={`flex-1 rounded-lg px-4 py-2 transition-all ${
                  activePlayerTab === 'my'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                My games
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {activePlayerTab === 'public' && publicSessions.map((session) => renderSessionCard(session, true))}
              {activePlayerTab === 'public' && !publicSessions.length && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                  No public games are available right now.
                </div>
              )}
              {activePlayerTab === 'my' &&
                mySessions.map((session) => (
                  <article
                    key={session.id}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
                  >
                    {renderSessionCard(session, false)}
                    <button
                      type="button"
                      onClick={() => navigate(`/games/${session.id}`)}
                      className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                    >
                      View details
                    </button>
                  </article>
                ))}

              {activePlayerTab === 'my' && !mySessions.length && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
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

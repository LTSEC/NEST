import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AppNav from '../components/AppNav';
import { listSessionsForPlayer } from '../data/gameSessions';
import { useAuth } from '../providers/AuthProvider';

const Home: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const runningSession = useMemo(() => {
    if (!user) return null;
    const sessions = listSessionsForPlayer(user.id);
    return sessions.find((session) => session.status === 'running') ?? null;
  }, [user]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <AppNav />
      <main className="mx-auto max-w-6xl px-6 py-10" aria-label="Main content">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Welcome back{user?.name ? `, ${user.name}` : ''}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Here's what's happening with your competitions.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="group rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:shadow-black/20">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Current game</p>
            <h2 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">Team competition</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Jump into the match your team is playing.</p>
            <button
              type="button"
              disabled={!runningSession}
              onClick={() => runningSession && navigate(`/games/${runningSession.id}`)}
              className="mt-5 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 hover:shadow-md hover:shadow-indigo-500/25 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
            >
              {runningSession ? `Open ${runningSession.gameName}` : 'No active game'}
            </button>
          </div>

          <div className="group rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:shadow-black/20">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Team</p>
            <h2 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">Manage roster</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Update members, respond to invites, or join new teams.</p>
            <button
              type="button"
              onClick={() => navigate('/teams')}
              className="mt-5 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 hover:shadow-md dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              Go to team page
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Home;

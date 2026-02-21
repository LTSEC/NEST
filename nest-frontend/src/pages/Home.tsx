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
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">Current game</p>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Team competition</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">Jump into the match your team is playing.</p>
            <button
              type="button"
              disabled={!runningSession}
              onClick={() => runningSession && navigate(`/games/${runningSession.id}`)}
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-indigo-600 dark:bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 dark:hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-600"
            >
              {runningSession ? `Open ${runningSession.gameName}` : 'No active game'}
            </button>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">Team</p>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Manage roster</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">Update members, respond to invites, or join new teams.</p>
            <button
              type="button"
              onClick={() => navigate('/teams')}
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-slate-900 dark:bg-slate-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 dark:hover:bg-slate-600"
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

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
    <div className="min-h-screen bg-slate-50">
      <AppNav />
      <main className="mx-auto max-w-6xl px-6 py-10" aria-label="Main content">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Current game</p>
            <h2 className="text-xl font-bold text-slate-900">Team competition</h2>
            <p className="text-sm text-slate-600">Jump into the match your team is playing.</p>
            <button
              type="button"
              disabled={!runningSession}
              onClick={() => runningSession && navigate(`/games/${runningSession.id}`)}
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {runningSession ? `Open ${runningSession.gameName}` : 'No active game'}
            </button>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Team</p>
            <h2 className="text-xl font-bold text-slate-900">Manage roster</h2>
            <p className="text-sm text-slate-600">Update members, respond to invites, or join new teams.</p>
            <button
              type="button"
              onClick={() => navigate('/teams')}
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
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

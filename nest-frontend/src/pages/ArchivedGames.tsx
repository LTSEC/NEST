import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import { listArchivedGamesForDeveloper } from '../data/archivedGames';
import { useAuth } from '../providers/AuthProvider';
import ComingSoon from './partials/ComingSoon';

const ArchivedGames: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  if (user.role !== 'developer') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <NavBar role="user" userName={user.name} onLogout={logout} />
        <main className="mx-auto max-w-6xl px-6 py-10">
          <ComingSoon
            title="Archived Games"
            description="Only developers can review archived games. Switch to a developer account to continue."
          />
        </main>
      </div>
    );
  }

  const archives = useMemo(() => listArchivedGamesForDeveloper(user.id), [user.id]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <NavBar role="developer" userName={user.name} onLogout={logout} />
      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Archives</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Archived games</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Review completed games, historical scores, and network summaries separate from live sessions.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {archives.map((archive) => (
            <article
              key={archive.id}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:shadow-black/20"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{archive.sessionName}</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    {new Date(archive.startedAt).toLocaleString()} — {new Date(archive.endedAt).toLocaleString()}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  Archived
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{archive.networkSummary ?? 'Network summary pending.'}</p>
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-500 dark:text-slate-400">{archive.results.length} teams captured</span>
                <button
                  type="button"
                  onClick={() => navigate(`/archives/${archive.id}`)}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-xs text-white shadow-sm transition-all hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                >
                  View details
                </button>
              </div>
            </article>
          ))}
        </section>

        {!archives.length && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            You haven't archived any games yet. Complete a session to see it here.
          </div>
        )}
      </main>
    </div>
  );
};

export default ArchivedGames;

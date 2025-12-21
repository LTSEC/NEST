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
      <div className="min-h-screen bg-slate-50">
        <NavBar role="user" userName={user.name} onLogout={logout} />
        <main className="mx-auto max-w-5xl p-6">
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
    <div className="min-h-screen bg-slate-50">
      <NavBar role="developer" userName={user.name} onLogout={logout} />
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Archives</p>
          <h1 className="text-2xl font-bold text-slate-900">Archived games</h1>
          <p className="text-sm text-slate-600">
            Review completed games, historical scores, and network summaries separate from live sessions.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {archives.map((archive) => (
            <article
              key={archive.id}
              className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{archive.sessionName}</p>
                  <p className="text-[11px] text-slate-500">
                    {new Date(archive.startedAt).toLocaleString()} — {new Date(archive.endedAt).toLocaleString()}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                  Archived
                </span>
              </div>
              <p className="text-xs text-slate-600">{archive.networkSummary ?? 'Network summary pending.'}</p>
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                <span>{archive.results.length} teams captured</span>
                <button
                  type="button"
                  onClick={() => navigate(`/archives/${archive.id}`)}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-xs text-white shadow-sm transition hover:bg-indigo-500"
                >
                  View details
                </button>
              </div>
            </article>
          ))}
        </section>

        {!archives.length && (
          <div className="rounded-xl bg-white p-4 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
            You haven't archived any games yet. Complete a session to see it here.
          </div>
        )}
      </main>
    </div>
  );
};

export default ArchivedGames;

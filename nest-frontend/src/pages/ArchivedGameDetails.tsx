import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import NavBar from '../components/NavBar';
import { getArchivedGameById } from '../data/archivedGames';
import { getTeamById } from '../data/teams';
import { useAuth } from '../providers/AuthProvider';
import ComingSoon from './partials/ComingSoon';

const ArchivedGameDetails: React.FC = () => {
  const { archiveId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  if (!user) return null;

  if (user.role !== 'developer') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <NavBar role="user" userName={user.name} onLogout={logout} />
        <main className="mx-auto max-w-6xl px-6 py-10">
          <ComingSoon
            title="Archived Game"
            description="Only developers can open archived game details. Switch to a developer account to continue."
          />
        </main>
      </div>
    );
  }

  const archive = archiveId ? getArchivedGameById(archiveId) : undefined;

  if (!archive) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <NavBar role="developer" userName={user.name} onLogout={logout} />
        <main className="mx-auto max-w-6xl px-6 py-10">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            Archived game not found.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <NavBar role="developer" userName={user.name} onLogout={logout} />
      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Archived Game</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{archive.sessionName}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {new Date(archive.startedAt).toLocaleString()} — {new Date(archive.endedAt).toLocaleString()}
          </p>
        </header>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">Network summary</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              Archived
            </span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{archive.networkSummary ?? 'No summary available.'}</p>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Results</p>
            <div className="space-y-2">
              {archive.results.map((result) => (
                <div
                  key={`${archive.id}-${result.teamId}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800"
                >
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      Position {result.position}: {getTeamById(result.teamId)?.name ?? result.teamId}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Participants: {result.participants.join(', ') || 'Unavailable'}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">Score {result.score}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="flex flex-wrap justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/archives')}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Back to archives
          </button>
          <button
            type="button"
            onClick={() => navigate('/my-games')}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            Manage games
          </button>
        </div>
      </main>
    </div>
  );
};

export default ArchivedGameDetails;

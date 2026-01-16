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
      <div className="min-h-screen bg-slate-50">
        <NavBar role="user" userName={user.name} onLogout={logout} />
        <main className="mx-auto max-w-5xl p-6">
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
      <div className="min-h-screen bg-slate-50">
        <NavBar role="developer" userName={user.name} onLogout={logout} />
        <main className="mx-auto max-w-5xl p-6">
          <div className="rounded-xl bg-white p-6 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200">
            Archived game not found.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar role="developer" userName={user.name} onLogout={logout} />
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <header className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Archived Game</p>
          <h1 className="text-2xl font-bold text-slate-900">{archive.sessionName}</h1>
          <p className="text-sm text-slate-600">
            {new Date(archive.startedAt).toLocaleString()} — {new Date(archive.endedAt).toLocaleString()}
          </p>
        </header>

        <section className="space-y-3 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-700">
            <span className="font-semibold">Network summary</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
              Archived
            </span>
          </div>
          <p className="text-sm text-slate-700">{archive.networkSummary ?? 'No summary available.'}</p>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800">Results</p>
            <div className="space-y-2 text-sm text-slate-700">
              {archive.results.map((result) => (
                <div
                  key={`${archive.id}-${result.teamId}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      Position {result.position}: {getTeamById(result.teamId)?.name ?? result.teamId}
                    </p>
                    <p className="text-[11px] text-slate-600">
                      Participants: {result.participants.join(', ') || 'Unavailable'}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-indigo-700">Score {result.score}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="flex flex-wrap justify-between gap-3 text-sm font-semibold text-indigo-700">
          <button
            type="button"
            onClick={() => navigate('/archives')}
            className="rounded-lg bg-white px-4 py-2 text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            Back to archives
          </button>
          <button
            type="button"
            onClick={() => navigate('/my-games')}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-white shadow-sm transition hover:bg-indigo-500"
          >
            Manage games
          </button>
        </div>
      </main>
    </div>
  );
};

export default ArchivedGameDetails;

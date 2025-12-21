import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import { Game, deleteGame, listGamesForDeveloper } from '../data/games';
import { useAuth } from '../providers/AuthProvider';
import ComingSoon from './partials/ComingSoon';

const MyGames: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isDeveloper = user?.role === 'developer';

  const [games, setGames] = useState<Game[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (user && isDeveloper) {
      setGames(listGamesForDeveloper(user.id));
    }
  }, [isDeveloper, user]);

  const filteredGames = useMemo(
    () =>
      games.filter((game) => game.name.toLowerCase().includes(searchTerm.trim().toLowerCase())),
    [games, searchTerm],
  );

  const handleDelete = (gameId: string) => {
    if (!user) return;
    deleteGame(gameId, user.id);
    setGames(listGamesForDeveloper(user.id));
  };

  if (!user) return null;

  if (!isDeveloper) {
    return (
      <div className="min-h-screen bg-slate-50">
        <NavBar role="user" userName={user.name} onLogout={logout} />
        <main className="mx-auto max-w-5xl p-6">
          <ComingSoon
            title="My Games"
            description="Only developers can manage games. Switch to a developer account to continue."
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar role="developer" userName={user.name} onLogout={logout} />
      <main className="mx-auto max-w-5xl p-6 space-y-6">
        <section className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">My Games</p>
              <h1 className="text-2xl font-bold text-slate-900">Your games</h1>
              <p className="text-sm text-slate-600">Filter and manage your games. Create or edit configurations from dedicated screens.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <input
                type="search"
                placeholder="Search games..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 sm:w-64"
              />
              <button
                type="button"
                onClick={() => navigate('/my-games/new')}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                Create game
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {filteredGames.map((game) => {
              const isRedVsBlue = game.types.includes('Red vs. Blue');
              return (
                <article key={game.id} className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                  <header className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">{game.name}</h3>
                      <p className="text-xs text-slate-500">Created {new Date(game.createdAt).toLocaleString()}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(game.id)}
                      className="text-sm font-semibold text-red-600 hover:text-red-500"
                    >
                      Delete
                    </button>
                  </header>

                  <div className="flex flex-wrap gap-2 text-xs font-medium">
                    {game.types.map((type) => (
                      <span key={type} className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700 ring-1 ring-indigo-100">
                        {type}
                      </span>
                    ))}
                  </div>

                  {isRedVsBlue && (
                    <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                      <p className="font-semibold text-slate-800">Red vs. Blue configuration</p>
                      <p className="mt-1 text-xs text-slate-600">Services: {game.rvbServices.join(', ') || 'None selected'}</p>
                      <p className="text-xs text-slate-600">Teams: {game.teamCount}</p>
                    </div>
                  )}

                  {!isRedVsBlue && (
                    <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                      Configuration for Injects and CTFs coming soon.
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/my-games/${game.id}/edit`)}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                    >
                      Edit Game
                    </button>
                    {isRedVsBlue && (
                      <button
                        type="button"
                        onClick={() => navigate(`/my-games/${game.id}/network`)}
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                      >
                        Edit Network
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {!filteredGames.length && (
            <div className="rounded-xl bg-white p-4 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
              No games found. Adjust your search or create a new experience to get started.
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default MyGames;

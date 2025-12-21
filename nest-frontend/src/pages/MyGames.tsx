import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import { HostedGameStatus, hostGameInstance } from '../data/gameHosting';
import { Game, deleteGame, listGamesForDeveloper } from '../data/games';
import { useAuth } from '../providers/AuthProvider';
import ComingSoon from './partials/ComingSoon';

const MyGames: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isDeveloper = user?.role === 'developer';

  const [games, setGames] = useState<Game[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [hostingGameId, setHostingGameId] = useState<string | null>(null);
  const [hostingError, setHostingError] = useState<string | null>(null);
  const [activeHostedGames, setActiveHostedGames] = useState<HostedGameStatus[]>([]);
  const [pendingHostGame, setPendingHostGame] = useState<Game | null>(null);
  const [teamCountInput, setTeamCountInput] = useState('2');

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

  const activeHostedCount = useMemo(
    () => activeHostedGames.filter((session) => session.status !== 'stopped').length,
    [activeHostedGames],
  );

  const handleDelete = (gameId: string) => {
    if (!user) return;
    deleteGame(gameId, user.id);
    setGames(listGamesForDeveloper(user.id));
  };

  const startHostingGame = async (game: Game, teams?: number) => {
    setHostingGameId(game.id);
    setHostingError(null);

    try {
      const hosted = await hostGameInstance(game, { teamCount: teams });
      setActiveHostedGames((previous) => [hosted, ...previous.filter((entry) => entry.id !== hosted.id)]);
    } catch (error) {
      setHostingError(error instanceof Error ? error.message : 'Failed to host game.');
    } finally {
      setHostingGameId(null);
    }
  };

  const handleHostClick = (game: Game) => {
    if (game.types.includes('Red vs. Blue')) {
      setPendingHostGame(game);
      setTeamCountInput(String(Math.max(1, game.teamCount || 2)));
      return;
    }

    startHostingGame(game);
  };

  const confirmTeamSelection = () => {
    if (!pendingHostGame) return;

    const parsedTeams = Number(teamCountInput);
    const safeTeamCount = Number.isFinite(parsedTeams) && parsedTeams > 0 ? Math.floor(parsedTeams) : 1;
    const gameToHost = pendingHostGame;
    setPendingHostGame(null);
    startHostingGame(gameToHost, safeTeamCount);
  };

  const cancelTeamSelection = () => setPendingHostGame(null);

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
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600">
                <span className={`h-2 w-2 rounded-full ${activeHostedCount ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <span>
                  {activeHostedCount} active {activeHostedCount === 1 ? 'game' : 'games'}
                </span>
              </div>
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

          {hostingError && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
              {hostingError}
            </div>
          )}

          {activeHostedGames.length > 0 && (
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">Active game sessions</p>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                  {activeHostedCount} active
                </span>
              </div>

              <div className="mt-3 space-y-2 text-sm text-slate-700">
                {activeHostedGames.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100"
                  >
                    <div>
                      <p className="font-semibold text-slate-800">{session.name}</p>
                      <p className="text-xs text-slate-500">Status: {session.status}</p>
                    </div>
                    <span className="text-xs font-semibold text-indigo-700">#{session.id}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                      <p className="text-xs text-slate-600">
                        Teams: {game.teamCount || 'Choose when hosting'}
                      </p>
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
                      onClick={() => handleHostClick(game)}
                      disabled={hostingGameId === game.id}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                    >
                      {hostingGameId === game.id ? 'Hosting...' : 'Host game'}
                    </button>
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

        {pendingHostGame && (
          <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Host {pendingHostGame.name}</h2>
              <p className="mt-1 text-sm text-slate-600">
                Choose the number of teams before hosting this Red vs. Blue game.
              </p>

              <div className="mt-4 space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="team-count-selection">
                  Number of teams
                </label>
                <input
                  id="team-count-selection"
                  type="number"
                  min={1}
                  value={teamCountInput}
                  onChange={(event) => setTeamCountInput(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelTeamSelection}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmTeamSelection}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                  Start hosting
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default MyGames;

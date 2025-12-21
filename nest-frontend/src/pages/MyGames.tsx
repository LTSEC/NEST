import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import { Game, GameType, RvbService, createGame, deleteGame, listGamesForDeveloper } from '../data/games';
import { useAuth } from '../providers/AuthProvider';
import ComingSoon from './partials/ComingSoon';

const gameTypes: GameType[] = ['Injects', 'CTFs', 'Red vs. Blue'];
const rvbServices: RvbService[] = ['Scoring Engine', 'DNS', 'CDN', 'CA'];

const MyGames: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isDeveloper = user?.role === 'developer';

  const [games, setGames] = useState<Game[]>([]);
  const [name, setName] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<GameType[]>([]);
  const [selectedServices, setSelectedServices] = useState<RvbService[]>([]);
  const [teamCount, setTeamCount] = useState(2);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && isDeveloper) {
      setGames(listGamesForDeveloper(user.id));
    }
  }, [isDeveloper, user]);

  const hasRvbSelected = useMemo(() => selectedTypes.includes('Red vs. Blue'), [selectedTypes]);

  const toggleType = (type: GameType) => {
    setSelectedTypes((prev) => {
      const exists = prev.includes(type);
      const next = exists ? prev.filter((value) => value !== type) : [...prev, type];
      if (!next.includes('Red vs. Blue')) {
        setSelectedServices([]);
        setTeamCount(2);
      }
      return next;
    });
  };

  const toggleService = (service: RvbService) => {
    setSelectedServices((prev) =>
      prev.includes(service) ? prev.filter((value) => value !== service) : [...prev, service]
    );
  };

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!user || !isDeveloper) return;

    if (!selectedTypes.length) {
      setError('Select at least one game type.');
      return;
    }

    if (hasRvbSelected && !selectedServices.length) {
      setError('Choose at least one Red vs. Blue service.');
      return;
    }

    if (hasRvbSelected && teamCount < 1) {
      setError('Enter at least one team.');
      return;
    }

    try {
      const newGame = createGame({
        name,
        developerId: user.id,
        types: selectedTypes,
        rvbServices: hasRvbSelected ? selectedServices : [],
        teamCount: hasRvbSelected ? teamCount : 0,
      });

      setGames((prev) => [newGame, ...prev]);
      setName('');
      setSelectedTypes([]);
      setSelectedServices([]);
      setTeamCount(2);
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : 'Failed to create game.');
    }
  };

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
        <section className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">My Games</p>
          <h1 className="text-2xl font-bold text-slate-900">Create a new game</h1>
          <p className="text-sm text-slate-600">
            Choose the experiences included in your game. Red vs. Blue requires services and team counts; Injects and CTFs are
            marked as coming soon.
          </p>
        </section>

        <form onSubmit={handleCreate} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 space-y-6">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="game-name">
              Game name
            </label>
            <input
              id="game-name"
              name="game-name"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Enter a game name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-800">Select game types</p>
            <div className="flex flex-wrap gap-4">
              {gameTypes.map((type) => (
                <label key={type} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    checked={selectedTypes.includes(type)}
                    onChange={() => toggleType(type)}
                  />
                  {type}
                </label>
              ))}
            </div>
          </div>

          {hasRvbSelected && (
            <div className="grid gap-6 rounded-xl bg-slate-50 p-4 md:grid-cols-2">
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-800">Red vs. Blue services</p>
                <div className="flex flex-col gap-2 text-sm text-slate-700">
                  {rvbServices.map((service) => (
                    <label key={service} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        checked={selectedServices.includes(service)}
                        onChange={() => toggleService(service)}
                      />
                      {service}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-800" htmlFor="team-count">
                  Number of teams
                </label>
                <input
                  id="team-count"
                  type="number"
                  min={1}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  value={teamCount}
                  onChange={(event) => setTeamCount(Number(event.target.value))}
                  required
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              Injects and CTFs setup screens are placeholders for now. Red vs. Blue will unlock the network editor after
              creation.
            </div>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Create game
            </button>
          </div>
        </form>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Your games</h2>
            <p className="text-sm text-slate-600">{games.length} total</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {games.map((game) => {
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

                  <div className="flex items-center justify-end gap-2">
                    {isRedVsBlue && (
                      <button
                        type="button"
                        onClick={() => navigate(`/my-games/${game.id}/network`)}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                      >
                        Edit Network
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {!games.length && (
            <div className="rounded-xl bg-white p-4 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
              No games yet. Create your first experience to get started.
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default MyGames;

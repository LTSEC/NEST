import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import NavBar from '../components/NavBar';
import { Game, GameType, RvbService, createGame, getGameById, updateGame } from '../data/games';
import { useAuth } from '../providers/AuthProvider';
import ComingSoon from './partials/ComingSoon';

const gameTypes: GameType[] = ['Injects', 'CTFs', 'Red vs. Blue'];
const rvbServices: RvbService[] = ['Scoring Engine', 'DNS', 'CDN', 'CA'];

const GameEditor: React.FC = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isDeveloper = user?.role === 'developer';
  const editing = Boolean(gameId);

  const existingGame: Game | undefined = useMemo(() => {
    if (!gameId) return undefined;
    const found = getGameById(gameId);
    if (!found || !user || found.developerId !== user.id) return undefined;
    return found;
  }, [gameId, user]);

  const [name, setName] = useState(existingGame?.name ?? '');
  const [selectedTypes, setSelectedTypes] = useState<GameType[]>(existingGame?.types ?? []);
  const [selectedServices, setSelectedServices] = useState<RvbService[]>(existingGame?.rvbServices ?? []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existingGame) {
      setName(existingGame.name);
      setSelectedTypes(existingGame.types);
      setSelectedServices(existingGame.rvbServices);
    }
  }, [existingGame]);

  useEffect(() => {
    if (!isDeveloper) {
      navigate('/');
    }
  }, [isDeveloper, navigate]);

  const hasRvbSelected = useMemo(() => selectedTypes.includes('Red vs. Blue'), [selectedTypes]);

  const toggleType = (type: GameType) => {
    setSelectedTypes((prev) => {
      const exists = prev.includes(type);
      const next = exists ? prev.filter((value) => value !== type) : [...prev, type];
      if (!next.includes('Red vs. Blue')) {
        setSelectedServices([]);
      }
      return next;
    });
  };

  const toggleService = (service: RvbService) => {
    setSelectedServices((prev) =>
      prev.includes(service) ? prev.filter((value) => value !== service) : [...prev, service]
    );
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
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

    try {
      if (editing && existingGame) {
        updateGame(existingGame.id, user.id, {
          name,
          types: selectedTypes,
          rvbServices: selectedServices,
          teamCount: existingGame.teamCount,
        });
      } else {
        createGame({
          name,
          developerId: user.id,
          types: selectedTypes,
          rvbServices: hasRvbSelected ? selectedServices : [],
          teamCount: existingGame?.teamCount ?? 0,
        });
      }
      navigate('/my-games');
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : 'Failed to save game.');
    }
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

  if (editing && !existingGame) {
    return (
      <div className="min-h-screen bg-slate-50">
        <NavBar role="developer" userName={user.name} onLogout={logout} />
        <main className="mx-auto max-w-5xl p-6">
          <div className="rounded-xl bg-white p-6 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200">
            Game not found.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar role="developer" userName={user.name} onLogout={logout} />
      <main className="mx-auto max-w-5xl p-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">My Games</p>
            <h1 className="text-2xl font-bold text-slate-900">{editing ? 'Edit game' : 'Create a new game'}</h1>
            <p className="text-sm text-slate-600">Choose the experiences included in your game.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/my-games')}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 space-y-6">
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
            <div className="space-y-3 rounded-xl bg-slate-50 p-4">
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

              <p className="text-xs text-slate-600">
                Team counts are chosen when hosting a Red vs. Blue game.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-end">
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              {editing ? 'Save changes' : 'Create game'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default GameEditor;

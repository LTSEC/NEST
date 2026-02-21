import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import NavBar from '../components/NavBar';
import { Credential, Game, GameType, RvbService, createGame, getGameById, updateGame } from '../data/games';
import { fetchPresets } from '../data/presets';
import { CyberGamePayload } from '../data/networkSerializer';
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
  const [credentials, setCredentials] = useState<Credential[]>(
    existingGame?.credentials ?? [{ username: 'root', password: 'changeme' }]
  );
  const [error, setError] = useState<string | null>(null);

  const [presets, setPresets] = useState<string[]>([]);
  const [presetMap, setPresetMap] = useState<Record<string, CyberGamePayload>>({});
  const [creationMode, setCreationMode] = useState<'scratch' | 'preset'>('scratch');
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [blackTeamCidr, setBlackTeamCidr] = useState<string>(existingGame?.blackTeamCidr ?? '10.20.0.0/16');
  const [scoringCheckInterval, setScoringCheckInterval] = useState<number>(existingGame?.scoringCheckInterval ?? 60);

  useEffect(() => {
    fetchPresets().then((data) => {
      setPresetMap(data);
      const keys = Object.keys(data);
      setPresets(keys);
      if (keys.length > 0 && !selectedPreset) {
        setSelectedPreset(keys[0]);
      }
    }).catch((err) => setError(err instanceof Error ? err.message : 'Failed to fetch presets'));
  }, []);

  useEffect(() => {
    if (existingGame) {
      setName(existingGame.name);
      setSelectedTypes(existingGame.types);
      if (existingGame.presetId) {
        setCreationMode('preset');
        setSelectedPreset(existingGame.presetId);
      } else {
        setSelectedServices(existingGame.rvbServices);
      }
      setCredentials(existingGame.credentials.length
        ? existingGame.credentials
        : [{ username: 'root', password: 'changeme' }]);
      if (existingGame.blackTeamCidr) {
        setBlackTeamCidr(existingGame.blackTeamCidr);
      }
      if (existingGame.scoringCheckInterval) {
        setScoringCheckInterval(existingGame.scoringCheckInterval);
      }
    }
  }, [existingGame]);

  useEffect(() => {
    if (creationMode === 'preset' && selectedPreset && presetMap[selectedPreset]) {
      const preset = presetMap[selectedPreset];
      const presetServices = preset.blackteamServices.map((s) => s.name) as RvbService[];
      setSelectedServices(presetServices);
    }
  }, [creationMode, selectedPreset, presetMap]);

  useEffect(() => {
    if (!isDeveloper) {
      navigate('/');
    }
  }, [isDeveloper, navigate]);

  const hasRvbSelected = useMemo(() => selectedTypes.includes('Red vs. Blue'), [selectedTypes]);
  const hasScoringEngine = useMemo(() => hasRvbSelected && selectedServices.includes('Scoring Engine'), [hasRvbSelected, selectedServices]);

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

    if (hasRvbSelected) {
      if (creationMode === 'preset' && !selectedPreset) {
        setError('Select a preset.');
        return;
      }
      if (creationMode === 'scratch' && !selectedServices.length) {
        setError('Choose at least one Red vs. Blue service.');
        return;
      }
    }

    try {
      const isPreset = hasRvbSelected && creationMode === 'preset';

      if (editing && existingGame) {
        updateGame(existingGame.id, user.id, {
          name,
          types: selectedTypes,
          rvbServices: selectedServices,
          credentials: hasRvbSelected ? credentials : [],
          teamCount: existingGame.teamCount,
          presetId: isPreset ? selectedPreset : undefined,
          blackTeamCidr: hasRvbSelected ? blackTeamCidr : undefined,
          scoringCheckInterval: hasScoringEngine ? scoringCheckInterval : undefined,
        });
      } else {
        createGame({
          name,
          developerId: user.id,
          types: selectedTypes,
          rvbServices: hasRvbSelected ? selectedServices : [],
          credentials: hasRvbSelected ? credentials : [],
          teamCount: existingGame?.teamCount ?? 0,
          presetId: isPreset ? selectedPreset : undefined,
          blackTeamCidr: hasRvbSelected ? blackTeamCidr : undefined,
          scoringCheckInterval: hasScoringEngine ? scoringCheckInterval : undefined,
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
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
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
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <NavBar role="developer" userName={user.name} onLogout={logout} />
        <main className="mx-auto max-w-5xl p-6">
          <div className="rounded-xl bg-white dark:bg-slate-900 p-6 text-sm text-slate-700 dark:text-slate-300 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
            Game not found.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <NavBar role="developer" userName={user.name} onLogout={logout} />
      <main className="mx-auto max-w-5xl p-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">My Games</p>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{editing ? 'Edit game' : 'Create a new game'}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">Choose the experiences included in your game.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/my-games')}
            className="rounded-lg bg-white dark:bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 transition hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 space-y-6">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="game-name">
              Game name
            </label>
            <input
              id="game-name"
              name="game-name"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500/30 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
              placeholder="Enter a game name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Select game types</p>
            <div className="flex flex-wrap gap-4">
              {gameTypes.map((type) => (
                <label key={type} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                    checked={selectedTypes.includes(type)}
                    onChange={() => toggleType(type)}
                  />
                  {type}
                </label>
              ))}
            </div>
          </div>

          {hasRvbSelected && (
            <div className="space-y-3 rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Red vs. Blue configuration</p>

              <div className="flex items-center gap-4 text-sm text-slate-700 dark:text-slate-300">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="creationMode"
                    value="scratch"
                    checked={creationMode === 'scratch'}
                    onChange={() => setCreationMode('scratch')}
                    className="h-4 w-4 border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                  />
                  Create from scratch
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="creationMode"
                    value="preset"
                    checked={creationMode === 'preset'}
                    onChange={() => setCreationMode('preset')}
                    className="h-4 w-4 border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                  />
                  Use a preset
                </label>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Services to include</p>
                <div className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-300">
                  {rvbServices.map((service) => (
                    <label key={service} className={`flex items-center gap-2 ${creationMode === 'preset' ? 'opacity-60' : ''}`}>
                      <input
                        type="checkbox"
                        disabled={creationMode === 'preset'}
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed"
                        checked={selectedServices.includes(service)}
                        onChange={() => toggleService(service)}
                      />
                      {service}
                    </label>
                  ))}
                </div>
              </div>

              {creationMode === 'preset' && (
                <div className="space-y-2">
                  <label htmlFor="preset-select" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Select a preset
                  </label>
                  <select
                    id="preset-select"
                    value={selectedPreset}
                    onChange={(e) => setSelectedPreset(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500/30 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {presets.length === 0 && <option value="">Loading presets...</option>}
                    {presets.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="black-team-cidr">
                  Competition Network CIDR (Black Team)
                </label>
                <input
                  id="black-team-cidr"
                  name="black-team-cidr"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500/30 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                  placeholder="10.20.0.0/16"
                  value={blackTeamCidr}
                  onChange={(event) => setBlackTeamCidr(event.target.value)}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Defines the IP range for the top-level competition router.
                </p>
              </div>

              {hasScoringEngine && (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="scoring-interval">
                    Scoring Check Interval
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      id="scoring-interval"
                      name="scoring-interval"
                      type="number"
                      min={15}
                      max={300}
                      step={1}
                      className="w-28 rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500/30 dark:bg-slate-800 dark:text-slate-100"
                      value={scoringCheckInterval}
                      onChange={(event) => {
                        const v = Number(event.target.value);
                        setScoringCheckInterval(Number.isNaN(v) ? 60 : Math.min(300, Math.max(15, v)));
                      }}
                    />
                    <span className="text-sm text-slate-500 dark:text-slate-400">seconds</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    How often the scoring engine checks each service (15s – 5min).
                  </p>
                </div>
              )}

              <p className="text-xs text-slate-600 dark:text-slate-400">
                Team counts are chosen when hosting a Red vs. Blue game.
              </p>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-800 dark:text-slate-100" htmlFor="credential-list">
                    Credentials (shared with players)
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setCredentials((prev) => [...prev, { username: 'user', password: 'password' }])
                    }
                    className="rounded-lg bg-white dark:bg-slate-900 px-3 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 shadow-sm ring-1 ring-indigo-200 dark:ring-indigo-500/30 transition hover:bg-indigo-50 dark:hover:bg-indigo-500/30"
                  >
                    Add credential
                  </button>
                </div>
                <div id="credential-list" className="space-y-2">
                  {credentials.map((credential, index) => (
                    <div
                      key={`${credential.username}-${index}`}
                      className="grid gap-2 rounded-lg bg-white dark:bg-slate-900 p-3 text-sm shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 md:grid-cols-2"
                    >
                      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Username
                        <input
                          type="text"
                          value={credential.username}
                          onChange={(event) => {
                            const value = event.target.value;
                            setCredentials((prev) =>
                              prev.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, username: value } : entry
                              )
                            );
                          }}
                          className="rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500/30 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Password
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={credential.password}
                            onChange={(event) => {
                              const value = event.target.value;
                              setCredentials((prev) =>
                                prev.map((entry, entryIndex) =>
                                  entryIndex === index ? { ...entry, password: value } : entry
                                )
                              );
                            }}
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500/30 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setCredentials((prev) =>
                                prev.filter((_, entryIndex) => entryIndex !== index || prev.length === 1)
                              )
                            }
                            className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 ring-1 ring-red-100 dark:ring-red-500/30 transition hover:bg-red-100 dark:hover:bg-red-900/30"
                          >
                            Remove
                          </button>
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">Defaults to root/changeme unless overridden.</p>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex items-center justify-end">
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 dark:bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 dark:hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
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

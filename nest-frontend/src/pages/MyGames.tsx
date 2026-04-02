import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NavBar from '../components/NavBar';
import { Game, deleteGame, listGamesForDeveloper } from '../data/games';
import {
  GameVisibility,
  GameSession,
  inviteTeamToSession,
  listDeveloperSessions,
  scheduleGameSession,
  shutdownSession,
  startSessionImmediately,
  cancelScheduledSession,
  updateInfrastructureStatus,
  removeSession,
  listSessionsForGame,
} from '../data/gameSessions';
import { destroyHostedGame, hostGameInstance, streamTerraformLogs } from '../data/gameHosting';
import { listTeams } from '../data/teams';
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
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [pendingHostGame, setPendingHostGame] = useState<Game | null>(null);
  const [teamCountInput, setTeamCountInput] = useState('2');
  const [startTimeInput, setStartTimeInput] = useState('');
  const [endTimeInput, setEndTimeInput] = useState('');
  const [visibility, setVisibility] = useState<GameVisibility>('public');
  const [minPlayersInput, setMinPlayersInput] = useState('3');
  const [invitedTeams, setInvitedTeams] = useState<string[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [consoleVisible, setConsoleVisible] = useState(false);
  const [consoleTitle, setConsoleTitle] = useState('');
  const [consoleMode, setConsoleMode] = useState<'create' | 'destroy' | null>(null);
  const [consoleMaximized, setConsoleMaximized] = useState(false);
  const sseRef = useRef<EventSource | null>(null);
  const [activeInfraId, setActiveInfraId] = useState<number | null>(null);
  const [destroyingSessionId, setDestroyingSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (user && isDeveloper) {
      setGames(listGamesForDeveloper(user.id));
      setSessions(listDeveloperSessions(user.id));
    }
  }, [isDeveloper, user]);

  useEffect(() => {
    if (!consoleVisible || activeInfraId === null) return undefined;

    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }

    const source = streamTerraformLogs(
      activeInfraId,
      (line) => {
        setConsoleLogs((prev) => [...prev, line]);

        if (line.includes('[OK] Terraform destroyed successfully')) {
          // Remove destroyed sessions from the active list entirely
          setSessions((prev) => {
            const destroyed = prev.filter((s) => s.infrastructureId === activeInfraId);
            for (const s of destroyed) {
              shutdownSession(s.id);
              removeSession(s.id);
            }
            return prev.filter((s) => s.infrastructureId !== activeInfraId);
          });
        }
      },
      () => {
        setConsoleLogs((prev) => [...prev, '[STREAM] Connection closed.']);
      },
      () => {
        setConsoleLogs((prev) => [...prev, '[STREAM] Connection error - retrying...']);
      },
    );
    sseRef.current = source;

    return () => {
      source.close();
      sseRef.current = null;
    };
  }, [consoleVisible, activeInfraId, consoleMode]);

  const filteredGames = useMemo(
    () =>
      games.filter((game) => game.name.toLowerCase().includes(searchTerm.trim().toLowerCase())),
    [games, searchTerm],
  );

  const activeHostedCount = useMemo(
    () =>
      sessions.filter(
        (session) =>
          !!session.infrastructureId &&
          (session.status === 'running' || session.infrastructureStatus === 'active')
      ).length,
    [sessions],
  );

  const handleDelete = async (gameId: string) => {
    if (!user) return;

    // Destroy any active sessions for this game first
    const gameSessions = listSessionsForGame(gameId);
    for (const session of gameSessions) {
      if (session.infrastructureId) {
        try {
          await destroyHostedGame(session.infrastructureId);
        } catch {
          // Infrastructure may already be destroyed or unreachable
        }
      }
      shutdownSession(session.id);
      removeSession(session.id);
    }

    deleteGame(gameId, user.id);
    setGames(listGamesForDeveloper(user.id));
    setSessions(listDeveloperSessions(user.id));
  };

  const startHostingGame = async (
    game: Game,
    teams?: number,
    overrides?: {
      startTime?: string;
      endTime?: string;
      visibility?: GameVisibility;
      minPlayers?: string;
      invitedTeamIds?: string[];
      skipTerraform?: boolean;
    },
  ) => {
    if (!user) return;
    if (activeHostedCount > 0 && !overrides?.skipTerraform) {
      setHostingError('You can only host one game at a time.');
      return;
    }

    setHostingGameId(game.id);
    setHostingError(null);

    if (!overrides?.skipTerraform) {
      setConsoleLogs([]);
      setConsoleTitle(`Hosting ${game.name}`);
      setConsoleMode('create');
      setConsoleVisible(true);
    }

    try {
      const effectiveStartTime = overrides?.startTime ?? startTimeInput;
      const effectiveEndTime = overrides?.endTime ?? endTimeInput;
      const effectiveVisibility = overrides?.visibility ?? visibility;
      const effectiveMinPlayersInput = overrides?.minPlayers ?? minPlayersInput;
      const effectiveInvitedTeams = overrides?.invitedTeamIds ?? invitedTeams;

      const start = effectiveStartTime ? new Date(effectiveStartTime) : new Date();
      const end = effectiveEndTime ? new Date(effectiveEndTime) : new Date(start.getTime() + 60 * 60 * 1000);

      if (end <= start) {
        setHostingError('End time must be after start time.');
        setHostingGameId(null);
        if (!overrides?.skipTerraform) setConsoleVisible(false);
        return;
      }

      const minPlayers = Number(effectiveMinPlayersInput);
      const safeMinPlayers = Number.isFinite(minPlayers) && minPlayers > 0 ? Math.floor(minPlayers) : 1;
      const effectiveMinimum = teams ? Math.max(safeMinPlayers, teams) : safeMinPlayers;

      let hosted = null;
      if (!overrides?.skipTerraform) {
        hosted = await hostGameInstance(game, { teamCount: teams });
        setActiveInfraId(hosted.id);
      }

      const session = scheduleGameSession(game, { id: user.id, name: user.name }, {
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        visibility: effectiveVisibility,
        invitedTeamIds: effectiveInvitedTeams,
        minPlayers: effectiveMinimum,
        infrastructureId: hosted?.id,
        infrastructureStatus: hosted ? (hosted.status === 'running' ? 'active' : 'creating') : undefined,
      });

      if (hosted) {
        updateInfrastructureStatus(session.id, hosted.status === 'running' ? 'active' : 'creating');
      }
      setSessions(listDeveloperSessions(user.id));
    } catch (error) {
      setHostingError(error instanceof Error ? error.message : 'Failed to host game.');
      if (!overrides?.skipTerraform) {
        setConsoleVisible(false);
        setActiveInfraId(null);
      }
    }

    setHostingGameId(null);
  };

  const handleTestNow = (game: Game) => {
    const defaultTeamCount = Math.max(1, game.teamCount || 2);
    const input = window.prompt('How many teams?', String(defaultTeamCount));
    if (input === null) return; // User cancelled
    const teamCount = Math.max(1, parseInt(input, 10) || defaultTeamCount);

    void startHostingGame(game, teamCount, {
      startTime: '',
      endTime: '',
      visibility: 'private',
      minPlayers: '1',
      invitedTeamIds: [],
    });
  };

  const handleHostClick = (game: Game) => {
    const now = new Date();
    const defaultStart = new Date(now.getTime() + 15 * 60 * 1000);
    const defaultEnd = new Date(defaultStart.getTime() + 60 * 60 * 1000);
    setPendingHostGame(game);
    setTeamCountInput(String(Math.max(1, game.teamCount || 2)));
    setStartTimeInput(defaultStart.toISOString().slice(0, 16));
    setEndTimeInput(defaultEnd.toISOString().slice(0, 16));
    setVisibility('public');
    setMinPlayersInput(String(Math.max(1, game.teamCount || 3)));
    setInvitedTeams([]);
  };

  const confirmTeamSelection = async () => {
    if (!pendingHostGame) return;

    const parsedTeams = Number(teamCountInput);
    const safeTeamCount = Number.isFinite(parsedTeams) && parsedTeams > 0 ? Math.floor(parsedTeams) : 1;
    const gameToHost = pendingHostGame;
    setPendingHostGame(null);
    await startHostingGame(gameToHost, safeTeamCount, { skipTerraform: true });
  };

  const cancelTeamSelection = () => setPendingHostGame(null);

  const handleDestroySession = async (session: GameSession) => {
    if (!user) return;
    if (session.status === 'scheduled' && !session.infrastructureId) {
      cancelScheduledSession(session.id);
      setSessions(listDeveloperSessions(user.id));
      return;
    }
    if (!session.infrastructureId) {
      setHostingError('No infrastructure deployment was recorded for this game.');
      return;
    }

    const confirmed = window.confirm('This will destroy the terraform deployment for this game. Continue?');
    if (!confirmed) return;

    setDestroyingSessionId(session.id);
    setConsoleLogs([]);
    setConsoleTitle(`Destroying ${session.gameName}`);
    setConsoleMode('destroy');
    setActiveInfraId(session.infrastructureId);
    setConsoleVisible(true);

    try {
      await destroyHostedGame(session.infrastructureId);
      updateInfrastructureStatus(session.id, 'destroying');
      setSessions(listDeveloperSessions(user.id));
    } catch (error) {
      setHostingError(error instanceof Error ? error.message : 'Failed to destroy game.');
      setActiveInfraId(null);
    }

    setDestroyingSessionId(null);
  };

  const handleStartNow = async (session: GameSession) => {
    if (!user) return;
    if (activeHostedCount > 0) {
      setHostingError('You can only host one game at a time.');
      return;
    }

    const game = games.find((g) => g.id === session.gameId);
    if (!game) {
      setHostingError('Game definition not found.');
      return;
    }

    setHostingGameId(game.id);
    setHostingError(null);
    setConsoleLogs([]);
    setConsoleTitle(`Hosting ${game.name}`);
    setConsoleMode('create');
    setConsoleVisible(true);
    setActiveInfraId(null); // Will be set after hosting starts

    try {
      // Determine team count from invited teams, defaulting to game default or 2
      const teamCount = Math.max(session.invitedTeamIds.length, game.teamCount || 2);

      const hosted = await hostGameInstance(game, { teamCount });

      setActiveInfraId(hosted.id);

      // Update session with infrastructure details
      updateInfrastructureStatus(session.id, hosted.status === 'running' ? 'active' : 'creating');
      // Also mark session as running
      startSessionImmediately(session.id);

      // Update local state
      setSessions(listDeveloperSessions(user.id));
    } catch (error) {
      setHostingError(error instanceof Error ? error.message : 'Failed to host game.');
      setConsoleVisible(false);
      setActiveInfraId(null);
    }

    setHostingGameId(null);
  };

  if (!user) return null;

  if (!isDeveloper) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <NavBar role="user" userName={user.name} onLogout={logout} />
        <main className="mx-auto max-w-6xl px-6 py-10">
          <ComingSoon
            title="My Games"
            description="Only developers can manage games. Switch to a developer account to continue."
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <NavBar role="developer" userName={user.name} onLogout={logout} />
      <main className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        <section className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">My Games</p>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Your games</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Filter and manage your games. Create or edit configurations from dedicated screens.</p>
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <span className={`h-2 w-2 rounded-full ${activeHostedCount ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
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
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:ring-indigo-500/20 sm:w-64"
              />
              <button
                type="button"
                onClick={() => navigate('/my-games/new')}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 hover:shadow-md hover:shadow-indigo-500/25 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >
                Create game
              </button>
            </div>
          </div>

          {hostingError && (
            <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
              {hostingError}
            </div>
          )}

          {sessions.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Active game sessions</p>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                  {activeHostedCount} active
                </span>
              </div>

              <div className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex flex-col gap-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{session.gameName}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Status: {session.status}</p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          {new Date(session.startTime).toLocaleString()} - {new Date(session.endTime).toLocaleString()}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">Visibility: {session.visibility}</p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">Minimum players: {session.minPlayers}</p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          Infrastructure: {session.infrastructureStatus ?? 'Not provisioned'}
                        </p>
                        {session.invitedTeamIds.length > 0 && (
                          <p className="text-[11px] text-slate-400 dark:text-slate-500">
                            Invited:{' '}
                            {listTeams()
                              .filter((team) => session.invitedTeamIds.includes(team.id))
                              .map((team) => team.name)
                              .join(', ')}
                          </p>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">#{session.id}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => navigate(`/games/${session.id}`)}
                        className="rounded-xl bg-indigo-600 px-3 py-1.5 text-white shadow-sm transition-all hover:bg-indigo-500 hover:shadow-md hover:shadow-indigo-500/25 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                      >
                        View game
                      </button>
                      {session.infrastructureId && (
                        <button
                          type="button"
                          onClick={() => {
                            setConsoleLogs([]);
                            setConsoleTitle(`Terraform console for ${session.gameName}`);
                            setConsoleMode(null);
                            setActiveInfraId(session.infrastructureId!);
                            setConsoleVisible(true);
                          }}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-indigo-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-indigo-400 dark:hover:bg-slate-700"
                        >
                          View terraform console
                        </button>
                      )}
                      {session.status === 'scheduled' && !session.infrastructureId && (
                        <button
                          type="button"
                          onClick={() => handleStartNow(session)}
                          className="rounded-xl bg-emerald-600 px-3 py-1.5 text-white shadow-sm transition-all hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                        >
                          Start Game Now
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDestroySession(session)}
                        disabled={destroyingSessionId === session.id}
                        className="rounded-xl bg-red-600 px-3 py-1.5 text-white shadow-sm transition-all hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-red-500 dark:hover:bg-red-400"
                      >
                        {session.status === 'scheduled' && !session.infrastructureId
                          ? 'Remove game'
                          : destroyingSessionId === session.id
                          ? 'Destroying...'
                          : 'Destroy game'}
                      </button>
                    </div>
                    {session.status === 'scheduled' && (
                      <div className="flex flex-wrap gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                        {listTeams().map((team) => (
                          <button
                            key={team.id}
                            type="button"
                            onClick={() => inviteTeamToSession(session.id, team.id)}
                            className={`rounded-full px-3 py-1 border transition ${
                              session.invitedTeamIds.includes(team.id)
                                ? 'border-indigo-500 bg-indigo-600 text-white dark:border-indigo-400 dark:bg-indigo-500'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                            }`}
                          >
                            {session.invitedTeamIds.includes(team.id) ? 'Invited' : 'Invite'} {team.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {filteredGames.map((game) => {
              const isRedVsBlue = game.types.includes('Red vs. Blue');
              return (
                <article key={game.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:shadow-black/20">
                  <header className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white">{game.name}</h3>
                      <p className="text-xs text-slate-400 dark:text-slate-500">Created {new Date(game.createdAt).toLocaleString()}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(game.id)}
                      className="text-sm font-semibold text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Delete
                    </button>
                  </header>

                  <div className="flex flex-wrap gap-2 text-xs font-medium">
                    {game.types.map((type) => (
                      <span key={type} className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                        {type}
                      </span>
                    ))}
                  </div>

                  {isRedVsBlue && (
                    <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      <p className="font-semibold text-slate-900 dark:text-white">Red vs. Blue configuration</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Services: {game.rvbServices.join(', ') || 'None selected'}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Teams: {game.teamCount || 'Choose when hosting'}
                      </p>
                    </div>
                  )}

                  {!isRedVsBlue && (
                    <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      Configuration for Injects and CTFs coming soon.
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleTestNow(game)}
                      disabled={hostingGameId === game.id || activeHostedCount > 0}
                      className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-amber-500 dark:hover:bg-amber-400"
                    >
                      {hostingGameId === game.id ? 'Starting...' : 'Test Now'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleHostClick(game)}
                      disabled={hostingGameId === game.id || activeHostedCount > 0}
                      className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                    >
                      {hostingGameId === game.id
                        ? 'Hosting...'
                        : activeHostedCount > 0
                        ? 'Hosting locked'
                        : 'Host game'}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/my-games/${game.id}/edit`)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      Edit Game
                    </button>
                    {isRedVsBlue && (
                      <button
                        type="button"
                        onClick={() => navigate(`/my-games/${game.id}/network`)}
                        className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 hover:shadow-md hover:shadow-indigo-500/25 dark:bg-indigo-500 dark:hover:bg-indigo-400"
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
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              No games found. Adjust your search or create a new experience to get started.
            </div>
          )}
        </section>

        {pendingHostGame && (
          <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">Host {pendingHostGame.name}</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose the schedule, visibility, and invited teams.</p>

              <div className="mt-4 space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="start-time-input">
                    Start time
                  </label>
                  <input
                    id="start-time-input"
                    type="datetime-local"
                    value={startTimeInput}
                    onChange={(event) => setStartTimeInput(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:ring-indigo-500/20"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="end-time-input">
                    End time
                  </label>
                  <input
                    id="end-time-input"
                    type="datetime-local"
                    value={endTimeInput}
                    onChange={(event) => setEndTimeInput(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:ring-indigo-500/20"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="visibility-choice">Visibility</label>
                  <select
                    id="visibility-choice"
                    value={visibility}
                    onChange={(event) => setVisibility(event.target.value as GameVisibility)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-indigo-500/20"
                  >
                    <option value="public">Public — any team can request to join before start</option>
                    <option value="private">Private — invite-only</option>
                  </select>
                </div>

                {pendingHostGame.types.includes('Red vs. Blue') && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="team-count-selection">
                      Number of teams
                    </label>
                    <input
                      id="team-count-selection"
                      type="number"
                      min={1}
                      value={teamCountInput}
                      onChange={(event) => setTeamCountInput(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:ring-indigo-500/20"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="min-players-input">
                    Minimum players required per team
                  </label>
                  <input
                    id="min-players-input"
                    type="number"
                    min={1}
                    value={minPlayersInput}
                    onChange={(event) => setMinPlayersInput(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:ring-indigo-500/20"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Invite teams</p>
                  <div className="flex max-h-36 flex-col gap-2 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-700">
                    {listTeams().map((team) => {
                      const checked = invitedTeams.includes(team.id);
                      return (
                        <label key={team.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              if (event.target.checked) {
                                setInvitedTeams((prev) => Array.from(new Set([...prev, team.id])));
                              } else {
                                setInvitedTeams((prev) => prev.filter((id) => id !== team.id));
                              }
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="flex-1">{team.name}</span>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">{team.members.length} members</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelTeamSelection}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmTeamSelection}
                  className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 hover:shadow-md hover:shadow-indigo-500/25 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                >
                  Create Lobby
                </button>
              </div>
            </div>
          </div>
        )}

        {consoleVisible && (
          <div
            className={`fixed z-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 ${
              consoleMaximized ? 'inset-4 flex flex-col' : 'bottom-4 right-4 w-full max-w-xl'
            }`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{consoleTitle || 'Terraform console'}</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  {consoleMode === 'create'
                    ? 'Provisioning infrastructure...'
                    : consoleMode === 'destroy'
                    ? 'Destroying infrastructure...'
                    : 'Live output from the terraform console'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConsoleMaximized(!consoleMaximized)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  {consoleMaximized ? 'Minimize' : 'Full Screen'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConsoleVisible(false);
                    setActiveInfraId(null);
                    if (sseRef.current) {
                      sseRef.current.close();
                      sseRef.current = null;
                    }
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Close
                </button>
              </div>
            </div>
            <pre
              className={`overflow-y-auto rounded-b-2xl bg-slate-900 px-4 py-3 text-xs text-slate-100 dark:bg-slate-950 ${
                consoleMaximized ? 'flex-1' : 'max-h-64'
              }`}
            >
              {(consoleLogs.length ? consoleLogs : ['Waiting for console output...']).join('\n')}
            </pre>
          </div>
        )}
      </main>
    </div>
  );
};

export default MyGames;

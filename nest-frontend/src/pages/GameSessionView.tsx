import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppNav from '../components/AppNav';
import NavBar from '../components/NavBar';
import { Credential, getGameById } from '../data/games';
import {
  GameSession,
  getSessionById,
  pauseSession,
  removeTeamFromSession,
  resumeSession,
  shutdownSession,
} from '../data/gameSessions';
import { listServiceHealthForSession, listServiceHealthTeams } from '../data/serviceHealth';
import { getTeamById, getTeamForUser } from '../data/teams';
import { useAuth } from '../providers/AuthProvider';

const sampleCtfCategories = [
  {
    name: 'OSINT',
    challenges: [
      { name: 'Find the credential leak', points: 100 },
      { name: 'Map the infrastructure', points: 150 },
    ],
  },
  {
    name: 'Binary Exploitation',
    challenges: [
      { name: 'Stack smash', points: 200 },
      { name: 'Heap hunt', points: 250 },
    ],
  },
  {
    name: 'Web Exploitation',
    challenges: [
      { name: 'Bypass the WAF', points: 150 },
      { name: 'Cookie tamper', points: 175 },
    ],
  },
];

type TabId = 'overview' | 'injects' | 'ctfs' | 'credentials' | 'services';

const GameSessionView: React.FC = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isDeveloper = user?.role === 'developer';

  const [session, setSession] = useState<GameSession | undefined>(() =>
    sessionId ? getSessionById(sessionId) : undefined
  );

  const game = useMemo(() => (session ? getGameById(session.gameId) : undefined), [session]);
  const playerTeam = useMemo(
    () => (user && !isDeveloper ? getTeamForUser(user.id) : undefined),
    [isDeveloper, user]
  );
  const serviceTeams = useMemo(() => {
    if (!session) return [];
    const trackedTeams = listServiceHealthTeams(session.id);
    const participantTeams = session.participantTeamIds
      .map((teamId) => getTeamById(teamId))
      .filter(Boolean)
      .map((team) => ({ teamId: team!.id, teamName: team!.name }));

    const combined = [...trackedTeams, ...participantTeams];
    return combined.filter(
      (team, index) => combined.findIndex((entry) => entry.teamId === team.teamId) === index
    );
  }, [session]);
  const [selectedServiceTeam, setSelectedServiceTeam] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId) {
      setSession(getSessionById(sessionId));
    }
  }, [sessionId]);

  useEffect(() => {
    if (playerTeam && !isDeveloper) {
      setSelectedServiceTeam(playerTeam.id);
      return;
    }

    if (serviceTeams.length && !selectedServiceTeam) {
      setSelectedServiceTeam(serviceTeams[0]?.teamId ?? null);
    }
  }, [isDeveloper, playerTeam, serviceTeams, selectedServiceTeam]);

  const availableTabs: { id: TabId; label: string; enabled: boolean }[] = useMemo(
    () => [
      { id: 'overview', label: 'Overview', enabled: true },
      { id: 'injects', label: 'Injects', enabled: session?.types.includes('Injects') ?? false },
      { id: 'ctfs', label: 'CTFs', enabled: session?.types.includes('CTFs') ?? false },
      { id: 'credentials', label: 'Credentials', enabled: session?.types.includes('Red vs. Blue') ?? false },
      {
        id: 'services',
        label: 'Services',
        enabled:
          (session?.types.includes('Red vs. Blue') ?? false) &&
          (isDeveloper || (!!playerTeam && session?.status === 'running')),
      },
    ],
    [isDeveloper, playerTeam, session?.status, session?.types]
  );

  const firstTab = availableTabs.find((tab) => tab.enabled)?.id ?? 'overview';
  const [activeTab, setActiveTab] = useState<TabId>(firstTab);

  useEffect(() => {
    const nextTab = availableTabs.find((tab) => tab.enabled)?.id ?? 'overview';
    setActiveTab((current) => (availableTabs.find((tab) => tab.id === current && tab.enabled) ? current : nextTab));
  }, [availableTabs, session]);

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        {isDeveloper ? <NavBar role="developer" userName={user?.name} onLogout={logout} /> : <AppNav />}
        <main className="mx-auto max-w-6xl px-6 py-10">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            Session not found.
          </div>
        </main>
      </div>
    );
  }

  const participantTeams = session.participantTeamIds
    .map((teamId) => getTeamById(teamId))
    .filter(Boolean)
    .map((team) => team!);

  const statusDescription: Record<GameSession['status'], string> = {
    running: 'Gameplay is live and scoring is active.',
    paused: 'The game is paused. Timers and scoring are halted until a developer resumes.',
    completed: 'The game is closed and infrastructure is being torn down or has already been destroyed.',
    scheduled: 'The match has not started yet; teams can prepare while you finalize setup.',
  };

  const handlePause = () => {
    const updated = pauseSession(session.id);
    if (updated) setSession({ ...updated });
  };

  const handleResume = () => {
    const updated = resumeSession(session.id);
    if (updated) setSession({ ...updated });
  };

  const handleShutdown = () => {
    const confirmShutdown = window.confirm(
      'Shutting down will destroy the game infrastructure and remove all players. Continue?'
    );
    if (!confirmShutdown) return;

    const updated = shutdownSession(session.id);
    if (updated) {
      setSession({ ...updated });
      navigate('/my-games');
    }
  };

  const handleKick = (teamId: string) => {
    const updated = removeTeamFromSession(session.id, teamId);
    if (updated) setSession({ ...updated });
  };

  const renderCredentials = (entries: Credential[]) => (
    <div className="space-y-2">
      {entries.map((credential, index) => (
        <div
          key={`${credential.username}-${index}`}
          className="flex flex-col gap-1 rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800 md:flex-row md:items-center md:justify-between"
        >
          <span className="font-semibold text-slate-900 dark:text-white">{credential.username}</span>
          <span className="text-slate-500 dark:text-slate-400">Password: {credential.password}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {isDeveloper ? <NavBar role="developer" userName={user?.name} onLogout={logout} /> : <AppNav />}
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Game session</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{session.gameName}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Hosted by {session.developerName} · {new Date(session.startTime).toLocaleString()} —{' '}
              {new Date(session.endTime).toLocaleString()}
            </p>
            <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
              {session.types.map((type) => (
                <span key={type} className="rounded-lg bg-indigo-50 px-2.5 py-1 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                  {type}
                </span>
              ))}
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{session.visibility}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold">
            <span
              className={`rounded-full px-3 py-1.5 ${
                session.status === 'running'
                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                  : session.status === 'paused'
                  ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {session.status}
            </span>
          </div>
        </header>

        <div
          className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm ${
            session.status === 'running'
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300'
              : session.status === 'paused'
              ? 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'
              : 'border border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
          }`}
        >
          <span className="mt-1 inline-flex h-2 w-2 flex-shrink-0 rounded-full bg-current" />
          <p className="leading-relaxed">{statusDescription[session.status]}</p>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold dark:bg-slate-800">
          {availableTabs
            .filter((tab) => tab.enabled)
            .map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-lg px-4 py-2 transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          {activeTab === 'overview' && (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3 rounded-xl bg-slate-50 p-5 dark:bg-slate-800">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Participants</p>
                  {isDeveloper ? (
                    <ul className="space-y-2 text-sm">
                      {participantTeams.map((team) => (
                        <li
                          key={team.id}
                          className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-slate-900"
                        >
                          <span className="text-slate-700 dark:text-slate-300">{team.name}</span>
                          {session.status !== 'completed' && (
                            <button
                              type="button"
                              onClick={() => handleKick(team.id)}
                              className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
                            >
                              Kick team
                            </button>
                          )}
                        </li>
                      ))}
                      {!participantTeams.length && (
                        <li className="text-xs text-slate-400 dark:text-slate-500">No teams have joined yet.</li>
                      )}
                    </ul>
                  ) : (
                    <div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-400">
                      Participant lists are hidden from players to keep match rosters private.
                    </div>
                  )}
                </div>

                <div className="space-y-3 rounded-xl bg-slate-50 p-5 dark:bg-slate-800">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Schedule</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Start: {new Date(session.startTime).toLocaleString()}
                    <br />
                    End: {new Date(session.endTime).toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Minimum players per team: {session.minPlayers}</p>
                </div>
              </div>

              {isDeveloper && (
                <div className="flex flex-wrap gap-3 text-sm font-semibold">
                  <button
                    type="button"
                    onClick={handlePause}
                    className="rounded-xl bg-amber-50 px-4 py-2.5 text-amber-700 transition-colors hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20"
                  >
                    Pause game
                  </button>
                  <button
                    type="button"
                    onClick={handleResume}
                    className="rounded-xl bg-emerald-600 px-4 py-2.5 text-white shadow-sm transition-all hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                  >
                    Resume
                  </button>
                  <button
                    type="button"
                    onClick={handleShutdown}
                    className="rounded-xl bg-red-600 px-4 py-2.5 text-white shadow-sm transition-all hover:bg-red-500 dark:bg-red-500 dark:hover:bg-red-400"
                  >
                    Shutdown game
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'injects' && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Inject queue</p>
              <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <li className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">Incident briefing (pending)</li>
                <li className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">Forensics report upload (pending)</li>
                <li className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800">Executive summary (pending)</li>
              </ul>
            </div>
          )}

          {activeTab === 'ctfs' && (
            <div className="space-y-5">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">CTF board</p>
              {sampleCtfCategories.map((category) => (
                <div key={category.name} className="space-y-3 rounded-xl bg-slate-50 p-5 dark:bg-slate-800">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">{category.name}</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {category.challenges.map((challenge) => (
                      <div
                        key={challenge.name}
                        className="rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-slate-900"
                      >
                        <p className="font-semibold text-slate-900 dark:text-white">{challenge.name}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">{challenge.points} pts</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'credentials' && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Competition credentials</p>
              {renderCredentials(game?.credentials ?? [])}
            </div>
          )}

          {activeTab === 'services' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Service health</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    View current status, uptime, and the last 10 checks for tracked services.
                  </p>
                </div>
                {isDeveloper && (
                  <select
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    value={selectedServiceTeam ?? ''}
                    onChange={(event) => setSelectedServiceTeam(event.target.value)}
                  >
                    {!serviceTeams.length && <option value="">No teams being tracked</option>}
                    {serviceTeams.map((team) => (
                      <option key={team.teamId} value={team.teamId}>
                        {team.teamName}
                      </option>
                    ))}
                  </select>
                )}
                {!isDeveloper && playerTeam && (
                  <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Team {playerTeam.name}
                  </div>
                )}
              </div>

              <div className="space-y-3 text-sm">
                {listServiceHealthForSession(
                  session.id,
                  isDeveloper ? selectedServiceTeam ?? undefined : playerTeam?.id
                ).map((service) => {
                  const tone =
                    service.status === 'up'
                      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                      : service.status === 'down'
                      ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';

                  const uptimeColor =
                    service.uptimePercentage >= 80
                      ? 'bg-emerald-500'
                      : service.uptimePercentage >= 60
                      ? 'bg-amber-400'
                      : 'bg-red-500';

                  return (
                    <div key={service.name} className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">{service.name}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">SLAs: {service.slaCount}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
                          {service.status === 'up'
                            ? 'Up'
                            : service.status === 'down'
                            ? 'Down'
                            : 'Unknown'}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div className="relative h-7 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className={`h-full rounded-full transition-all ${uptimeColor}`}
                            style={{ width: `${service.uptimePercentage}%` }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white drop-shadow">
                            {service.uptimePercentage.toFixed(1)}%
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">Last 10 checks:</span>
                          <div className="flex items-center gap-1">
                            {service.lastTenStatuses.map((status, index) => {
                              const dotColor =
                                status === 'up' ? 'bg-emerald-500' : status === 'down' ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-600';
                              return <span key={`${service.name}-${index}`} className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />;
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {!listServiceHealthForSession(
                  session.id,
                  isDeveloper ? selectedServiceTeam ?? undefined : playerTeam?.id
                ).length && (
                  <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    Service telemetry has not been reported for this team yet.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>

        <div className="flex flex-wrap justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Back to games
          </button>
          <button
            type="button"
            onClick={() => navigate('/teams')}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            View team
          </button>
        </div>
      </main>
    </div>
  );
};

export default GameSessionView;

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
import { listPreviousGamesForGame } from '../data/previousGames';
import { listServiceHealthForSession, listServiceHealthTeams } from '../data/serviceHealth';
import { getTeamById } from '../data/teams';
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

type TabId = 'overview' | 'injects' | 'ctfs' | 'credentials' | 'services' | 'history';

const GameSessionView: React.FC = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isDeveloper = user?.role === 'developer';

  const [session, setSession] = useState<GameSession | undefined>(() =>
    sessionId ? getSessionById(sessionId) : undefined
  );

  const game = useMemo(() => (session ? getGameById(session.gameId) : undefined), [session]);
  const previousGames = useMemo(() => (game ? listPreviousGamesForGame(game.id) : []), [game]);
  const serviceTeams = useMemo(() => (session ? listServiceHealthTeams(session.id) : []), [session]);
  const [selectedServiceTeam, setSelectedServiceTeam] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId) {
      setSession(getSessionById(sessionId));
    }
  }, [sessionId]);

  useEffect(() => {
    if (serviceTeams.length && !selectedServiceTeam) {
      setSelectedServiceTeam(serviceTeams[0]?.teamId ?? null);
    }
  }, [serviceTeams, selectedServiceTeam]);

  const availableTabs: { id: TabId; label: string; enabled: boolean }[] = useMemo(
    () => [
      { id: 'overview', label: 'Overview', enabled: true },
      { id: 'injects', label: 'Injects', enabled: session?.types.includes('Injects') ?? false },
      { id: 'ctfs', label: 'CTFs', enabled: session?.types.includes('CTFs') ?? false },
      { id: 'credentials', label: 'Credentials', enabled: session?.types.includes('Red vs. Blue') ?? false },
      {
        id: 'services',
        label: 'Services',
        enabled: isDeveloper && (session?.types.includes('Red vs. Blue') ?? false),
      },
      { id: 'history', label: 'Previous games', enabled: previousGames.length > 0 },
    ],
    [isDeveloper, previousGames.length, session?.types?.join(',')]
  );

  const firstTab = availableTabs.find((tab) => tab.enabled)?.id ?? 'overview';
  const [activeTab, setActiveTab] = useState<TabId>(firstTab);

  useEffect(() => {
    const nextTab = availableTabs.find((tab) => tab.enabled)?.id ?? 'overview';
    setActiveTab((current) => (availableTabs.find((tab) => tab.id === current && tab.enabled) ? current : nextTab));
  }, [availableTabs, session]);

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50">
        {isDeveloper ? <NavBar role="developer" userName={user?.name} onLogout={logout} /> : <AppNav />}
        <main className="mx-auto max-w-5xl p-6">
          <div className="rounded-xl bg-white p-6 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200">
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
          className="flex flex-col gap-1 rounded-lg bg-white px-3 py-2 text-sm text-slate-800 shadow-sm ring-1 ring-slate-200 md:flex-row md:items-center md:justify-between"
        >
          <span className="font-semibold">{credential.username}</span>
          <span className="text-slate-600">Password: {credential.password}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {isDeveloper ? <NavBar role="developer" userName={user?.name} onLogout={logout} /> : <AppNav />}
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Game session</p>
            <h1 className="text-2xl font-bold text-slate-900">{session.gameName}</h1>
            <p className="text-sm text-slate-600">
              Hosted by {session.developerName} · {new Date(session.startTime).toLocaleString()} —{' '}
              {new Date(session.endTime).toLocaleString()}
            </p>
            <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
              {session.types.map((type) => (
                <span key={type} className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700 ring-1 ring-indigo-100">
                  {type}
                </span>
              ))}
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-800">{session.visibility}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold">
            <span
              className={`rounded-full px-3 py-1 ring-1 ${
                session.status === 'running'
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
                  : session.status === 'paused'
                  ? 'bg-amber-50 text-amber-700 ring-amber-100'
                  : 'bg-slate-100 text-slate-700 ring-slate-200'
              }`}
            >
              {session.status}
            </span>
          </div>
        </header>

        <div
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
            session.status === 'running'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : session.status === 'paused'
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-slate-200 bg-white text-slate-800'
          }`}
        >
          <span className="mt-0.5 inline-flex h-2 w-2 flex-shrink-0 rounded-full bg-current" />
          <p className="leading-relaxed">{statusDescription[session.status]}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-800">
          {availableTabs
            .filter((tab) => tab.enabled)
            .map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-full px-4 py-2 ring-1 transition ${
                  activeTab === tab.id
                    ? 'bg-indigo-600 text-white ring-indigo-500'
                    : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
        </div>

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 rounded-xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-800">Participants</p>
                  {isDeveloper ? (
                    <ul className="space-y-2 text-sm text-slate-700">
                      {participantTeams.map((team) => (
                        <li
                          key={team.id}
                          className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200"
                        >
                          <span>{team.name}</span>
                          {session.status !== 'completed' && (
                            <button
                              type="button"
                              onClick={() => handleKick(team.id)}
                              className="rounded-lg bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-100 transition hover:bg-red-100"
                            >
                              Kick team
                            </button>
                          )}
                        </li>
                      ))}
                      {!participantTeams.length && (
                        <li className="text-xs text-slate-500">No teams have joined yet.</li>
                      )}
                    </ul>
                  ) : (
                    <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200">
                      Participant lists are hidden from players to keep match rosters private.
                    </div>
                  )}
                </div>

                <div className="space-y-2 rounded-xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-800">Schedule</p>
                  <p className="text-sm text-slate-700">
                    Start: {new Date(session.startTime).toLocaleString()}
                    <br />
                    End: {new Date(session.endTime).toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-600">Minimum players per team: {session.minPlayers}</p>
                </div>
              </div>

              {isDeveloper && (
                <div className="flex flex-wrap gap-3 text-sm font-semibold text-slate-800">
                  <button
                    type="button"
                    onClick={handlePause}
                    className="rounded-lg bg-amber-100 px-4 py-2 text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-200"
                  >
                    Pause game
                  </button>
                  <button
                    type="button"
                    onClick={handleResume}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-white shadow-sm transition hover:bg-emerald-500"
                  >
                    Resume
                  </button>
                  <button
                    type="button"
                    onClick={handleShutdown}
                    className="rounded-lg bg-red-600 px-4 py-2 text-white shadow-sm transition hover:bg-red-500"
                  >
                    Shutdown game
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'injects' && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-800">Inject queue</p>
              <ul className="space-y-1 text-sm text-slate-700">
                <li className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">Incident briefing (pending)</li>
                <li className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">Forensics report upload (pending)</li>
                <li className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">Executive summary (pending)</li>
              </ul>
            </div>
          )}

          {activeTab === 'ctfs' && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-slate-800">CTF board</p>
              {sampleCtfCategories.map((category) => (
                <div key={category.name} className="space-y-2 rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{category.name}</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {category.challenges.map((challenge) => (
                      <div
                        key={challenge.name}
                        className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200"
                      >
                        <p>{challenge.name}</p>
                        <p className="text-[11px] text-slate-500">{challenge.points} pts</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'credentials' && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-800">Competition credentials</p>
              {renderCredentials(game?.credentials ?? [])}
            </div>
          )}

          {activeTab === 'services' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Service health per team</p>
                  <p className="text-xs text-slate-600">
                    Review uptime percentages and live statuses for the team you are supporting.
                  </p>
                </div>
                <select
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm"
                  value={selectedServiceTeam ?? ''}
                  onChange={(event) => setSelectedServiceTeam(event.target.value)}
                  disabled={!serviceTeams.length}
                >
                  {!serviceTeams.length && <option value="">No teams being tracked</option>}
                  {serviceTeams.map((team) => (
                    <option key={team.teamId} value={team.teamId}>
                      {team.teamName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 text-sm text-slate-700">
                {listServiceHealthForSession(session.id, selectedServiceTeam ?? undefined).map((service) => {
                  const tone =
                    service.status === 'up'
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
                      : service.status === 'degraded'
                      ? 'bg-amber-50 text-amber-700 ring-amber-100'
                      : 'bg-red-50 text-red-700 ring-red-100';

                  return (
                    <div key={service.name} className="rounded-lg border border-slate-200 p-3 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-800">{service.name}</p>
                          <p className="text-[11px] text-slate-500">SLA tier {service.slaTier}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${tone}`}>
                          {service.status === 'up'
                            ? 'Up'
                            : service.status === 'degraded'
                            ? 'Degraded'
                            : 'Down'}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">
                          Uptime {service.uptimePercentage.toFixed(2)}%
                        </span>
                        <span className="rounded bg-slate-100 px-2 py-1 font-semibold text-slate-700">
                          SLA tier {service.slaTier} target
                        </span>
                      </div>
                    </div>
                  );
                })}

                {!listServiceHealthForSession(session.id, selectedServiceTeam ?? undefined).length && (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
                    Service telemetry has not been reported for this team yet.
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-800">Previous games</p>
              {previousGames.map((record) => (
                <article
                  key={record.id}
                  className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-semibold text-slate-900">{record.sessionName}</p>
                      <p className="text-[11px] text-slate-500">
                        {new Date(record.startedAt).toLocaleString()} — {new Date(record.endedAt).toLocaleString()}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                      Archived
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{record.networkSummary}</p>
                  <div className="space-y-1">
                    {record.results.map((result) => (
                      <div
                        key={`${record.id}-${result.teamId}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200"
                      >
                        <div>
                          <p className="font-semibold text-slate-800">
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
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="flex flex-wrap justify-between gap-3 text-sm font-semibold text-indigo-700">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg bg-white px-4 py-2 text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            Back to games
          </button>
          <button
            type="button"
            onClick={() => navigate('/teams')}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-white shadow-sm transition hover:bg-indigo-500"
          >
            View team
          </button>
        </div>
      </main>
    </div>
  );
};

export default GameSessionView;

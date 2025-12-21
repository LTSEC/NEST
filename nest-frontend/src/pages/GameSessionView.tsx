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

const serviceHistory = Array.from({ length: 10 }, (_, index) => (index % 3 === 0 ? 'down' : 'up'));

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

  useEffect(() => {
    if (sessionId) {
      setSession(getSessionById(sessionId));
    }
  }, [sessionId]);

  const availableTabs: { id: TabId; label: string; enabled: boolean }[] = [
    { id: 'overview', label: 'Overview', enabled: true },
    { id: 'injects', label: 'Injects', enabled: session?.types.includes('Injects') ?? false },
    { id: 'ctfs', label: 'CTFs', enabled: session?.types.includes('CTFs') ?? false },
    { id: 'credentials', label: 'Credentials', enabled: session?.types.includes('Red vs. Blue') ?? false },
    { id: 'services', label: 'Services', enabled: session?.types.includes('Red vs. Blue') ?? false },
  ];

  const firstTab = availableTabs.find((tab) => tab.enabled)?.id ?? 'overview';
  const [activeTab, setActiveTab] = useState<TabId>(firstTab);

  useEffect(() => {
    const nextTab = availableTabs.find((tab) => tab.enabled)?.id ?? 'overview';
    setActiveTab((current) => (availableTabs.find((tab) => tab.id === current && tab.enabled) ? current : nextTab));
  }, [session]);

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

  const handlePause = () => {
    const updated = pauseSession(session.id);
    if (updated) setSession({ ...updated });
  };

  const handleResume = () => {
    const updated = resumeSession(session.id);
    if (updated) setSession({ ...updated });
  };

  const handleShutdown = () => {
    const updated = shutdownSession(session.id);
    if (updated) setSession({ ...updated });
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
                  <ul className="space-y-2 text-sm text-slate-700">
                    {participantTeams.map((team) => (
                      <li
                        key={team.id}
                        className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200"
                      >
                        <span>{team.name}</span>
                        {isDeveloper && session.status !== 'completed' && (
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
              <p className="text-sm font-semibold text-slate-800">Service health</p>
              <div className="space-y-2 text-sm text-slate-700">
                {['Web', 'DNS', 'Database'].map((serviceName, serviceIndex) => (
                  <div key={serviceName} className="rounded-lg border border-slate-200 p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800">{serviceName}</span>
                      <span className="text-[11px] font-semibold text-indigo-700">SLA {(95 - serviceIndex * 5).toFixed(0)}%</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {serviceHistory.map((status, index) => (
                        <span
                          key={`${serviceName}-${index}`}
                          className={`h-2 w-2 rounded-full ${status === 'up' ? 'bg-emerald-500' : 'bg-red-500'}`}
                          title={`Check ${index + 1}: ${status === 'up' ? 'Up' : 'Down'}`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
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

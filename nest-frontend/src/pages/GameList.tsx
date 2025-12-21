import React, { useMemo, useState } from 'react';
import AppNav from '../components/AppNav';
import NavBar from '../components/NavBar';
import { getGameById } from '../data/games';
import {
  GameSession,
  joinSessionAsTeam,
  listActiveGameSessions,
  listPublicGames,
  listSessionsForPlayer,
} from '../data/gameSessions';
import { getTeamForUser } from '../data/teams';
import { useAuth } from '../providers/AuthProvider';

const formatRange = (session: GameSession) =>
  `${new Date(session.startTime).toLocaleString()} — ${new Date(session.endTime).toLocaleString()}`;

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

const GameList: React.FC = () => {
  const { user, logout } = useAuth();
  const isDeveloper = user?.role === 'developer';
  const playerTeam = user && !isDeveloper ? getTeamForUser(user.id) : undefined;

  const runningSessions = useMemo(
    () => listActiveGameSessions({ publicOnly: !isDeveloper }),
    [isDeveloper]
  );

  const publicSessions = useMemo(() => listPublicGames(), []);
  const mySessions = useMemo(() => (user && !isDeveloper ? listSessionsForPlayer(user.id) : []), [isDeveloper, user]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(mySessions[0]?.id ?? null);
  const selectedSession = useMemo(
    () => runningSessions.concat(mySessions).find((session) => session.id === selectedSessionId) ?? null,
    [mySessions, runningSessions, selectedSessionId]
  );

  const handleJoin = (session: GameSession) => {
    if (!playerTeam) return;
    joinSessionAsTeam(session.id, playerTeam.id);
    setSelectedSessionId(session.id);
  };

  const renderSessionCard = (session: GameSession, showJoin: boolean) => {
    const canJoin = playerTeam && playerTeam.members.length >= session.minPlayers;
    const alreadyJoined = playerTeam && session.participantTeamIds.includes(playerTeam.id);
    return (
      <article
        key={session.id}
        className="flex flex-col gap-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">{session.gameName}</p>
            <p className="text-xs text-slate-500">Developer: {session.developerName}</p>
            <p className="text-xs text-slate-500">{formatRange(session)}</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
            {session.status}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {session.types.map((type) => (
            <span key={type} className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
              {type}
            </span>
          ))}
          <span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-700">{session.visibility}</span>
        </div>

        {showJoin && playerTeam && (
          <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
            <span>
              Team {playerTeam.name} · {playerTeam.members.length} members · min {session.minPlayers} required
            </span>
            <button
              type="button"
              disabled={!canJoin || alreadyJoined}
              onClick={() => handleJoin(session)}
              className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {alreadyJoined ? 'Joined' : 'Join game'}
            </button>
          </div>
        )}

        {showJoin && !playerTeam && (
          <p className="text-xs text-red-600">Join or create a team to participate in games.</p>
        )}
      </article>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {isDeveloper ? <NavBar role="developer" userName={user?.name} onLogout={logout} /> : <AppNav />}
      <main className="mx-auto max-w-6xl p-6 space-y-6">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Game List</p>
          <h1 className="text-2xl font-bold text-slate-900">
            {isDeveloper ? 'Active sessions from all developers' : 'Explore live competitions'}
          </h1>
          <p className="text-sm text-slate-600">
            {isDeveloper
              ? 'Monitor what is running right now and who is hosting.'
              : 'Join public games or review the matches your team is in.'}
          </p>
        </header>

        {isDeveloper && (
          <section className="space-y-3">
            <p className="text-sm font-semibold text-slate-800">Running games</p>
            <div className="grid gap-3 md:grid-cols-2">
              {runningSessions.map((session) => renderSessionCard(session, false))}
            </div>
            {!runningSessions.length && (
              <div className="rounded-xl bg-white p-4 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
                No games are running at the moment.
              </div>
            )}
          </section>
        )}

        {!isDeveloper && (
          <section className="space-y-6">
            <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-800">
              <button
                type="button"
                onClick={() => setSelectedSessionId(null)}
                className={`rounded-full px-4 py-2 ring-1 transition ${
                  selectedSessionId === null
                    ? 'bg-indigo-600 text-white ring-indigo-500'
                    : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                Public games
              </button>
              <button
                type="button"
                onClick={() => setSelectedSessionId(mySessions[0]?.id ?? selectedSessionId)}
                className={`rounded-full px-4 py-2 ring-1 transition ${
                  selectedSessionId && mySessions.some((session) => session.id === selectedSessionId)
                    ? 'bg-indigo-600 text-white ring-indigo-500'
                    : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                My games
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {selectedSessionId === null && publicSessions.map((session) => renderSessionCard(session, true))}
              {selectedSessionId === null && !publicSessions.length && (
                <div className="rounded-xl bg-white p-4 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
                  No public games are available right now.
                </div>
              )}

              {selectedSessionId !== null &&
                mySessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSelectedSessionId(session.id)}
                    className={`flex flex-col gap-2 rounded-xl p-4 text-left shadow-sm ring-1 transition ${
                      selectedSessionId === session.id
                        ? 'bg-indigo-50 ring-indigo-200'
                        : 'bg-white ring-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{session.gameName}</p>
                        <p className="text-xs text-slate-500">{formatRange(session)}</p>
                      </div>
                      <span className="text-[11px] font-semibold uppercase text-indigo-700">{session.status}</span>
                    </div>
                  </button>
                ))}

              {selectedSessionId !== null && !mySessions.length && (
                <div className="rounded-xl bg-white p-4 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
                  Your team has not joined any games yet.
                </div>
              )}
            </div>

            {selectedSession && (
              <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{selectedSession.gameName}</p>
                    <p className="text-xs text-slate-500">Hosted by {selectedSession.developerName}</p>
                    <p className="text-xs text-slate-500">{formatRange(selectedSession)}</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                    {selectedSession.status}
                  </span>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {selectedSession.types.includes('Injects') && (
                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-800">Injects</p>
                      <ul className="mt-2 space-y-1 text-xs text-slate-700">
                        <li className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">Incident briefing (pending)</li>
                        <li className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">Forensics report upload (pending)</li>
                        <li className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">Executive summary (pending)</li>
                      </ul>
                    </div>
                  )}

                  {selectedSession.types.includes('CTFs') && (
                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-800">CTF board</p>
                      <div className="mt-3 space-y-3">
                        {sampleCtfCategories.map((category) => (
                          <div key={category.name} className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{category.name}</p>
                            <div className="grid grid-cols-2 gap-2">
                              {category.challenges.map((challenge) => (
                                <div
                                  key={challenge.name}
                                  className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200"
                                >
                                  <p>{challenge.name}</p>
                                  <p className="text-[11px] text-slate-500">{challenge.points} pts</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedSession.types.includes('Red vs. Blue') && (
                    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                      <p className="text-sm font-semibold text-slate-800">Credentials</p>
                      <ul className="mt-2 space-y-1 text-xs text-slate-700">
                        {(getGameById(selectedSession.gameId)?.credentials ?? ['root: changeme']).map((entry) => (
                          <li key={entry} className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                            {entry}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selectedSession.types.includes('Red vs. Blue') && (
                    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                      <p className="text-sm font-semibold text-slate-800">Services</p>
                      <div className="mt-2 space-y-2 text-xs text-slate-700">
                        {['Web', 'DNS', 'Database'].map((serviceName, serviceIndex) => (
                          <div
                            key={serviceName}
                            className="rounded-lg border border-slate-200 p-3 shadow-sm"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-800">{serviceName}</span>
                              <span className="text-[11px] font-semibold text-indigo-700">
                                SLA {(95 - serviceIndex * 5).toFixed(0)}%
                              </span>
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
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};

export default GameList;

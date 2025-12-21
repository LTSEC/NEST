import React, { useEffect, useState } from 'react';
import AppNav from '../components/AppNav';
import NavBar from '../components/NavBar';
import { useAuth } from '../providers/AuthProvider';

const Profile: React.FC = () => {
  const { user, updateUserName, logout } = useAuth();
  const isDeveloper = user?.role === 'developer';
  const [username, setUsername] = useState(user?.name ?? '');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    setUsername(user?.name ?? '');
  }, [user]);

  const handleUsernameSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim()) {
      setError('Please enter a username.');
      setStatus('error');
      return;
    }

    setIsSaving(true);
    setStatus('idle');
    setError('');

    try {
      await updateUserName(username.trim());
      setStatus('success');
    } catch (submissionError) {
      setError((submissionError as Error).message || 'Unable to update username.');
      setStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {isDeveloper ? <NavBar role="developer" userName={user?.name} onLogout={logout} /> : <AppNav />}
      <main className="mx-auto max-w-4xl px-6 py-10 space-y-8" aria-label="Profile settings">
        <header className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">Account</p>
          <h1 className="text-3xl font-bold text-slate-900">Profile</h1>
          <p className="text-sm text-slate-600">Manage how your name, email, and security appear across Nest.</p>
        </header>

        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200/70">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Change username</h2>
              <p className="text-sm text-slate-600">Update how your name appears in leaderboards and invitations.</p>
            </div>
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">Live</span>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleUsernameSubmit}>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700" htmlFor="username">
                Display name
              </label>
              <input
                id="username"
                name="username"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Enter your display name"
                autoComplete="name"
              />
            </div>

            {status === 'success' && (
              <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 ring-1 ring-green-100">
                Username updated in the Postgres users table.
              </div>
            )}

            {status === 'error' && error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">{error}</div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:bg-indigo-300"
                disabled={isSaving}
              >
                {isSaving ? 'Saving…' : 'Save username'}
              </button>
            </div>
          </form>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200/70">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Change email</h2>
                <p className="text-sm text-slate-600">Keep your inbox up to date for security alerts and team invites.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Coming soon</span>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700" htmlFor="email">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className="w-full rounded-lg border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-500 shadow-sm disabled:bg-slate-50"
                  placeholder={user?.email ?? 'you@example.com'}
                  disabled
                />
              </div>
              <p className="text-xs text-slate-500">Email updates will be available after we finish wiring the verification flow.</p>
            </div>
          </div>

          <div className="space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200/70">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Reset password</h2>
                <p className="text-sm text-slate-600">Send yourself a secure link to reset your credentials.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Coming soon</span>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                A password reset email will appear here once the backend endpoint is ready. Until then, keep your current password
                safe.
              </p>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm"
                disabled
              >
                Send reset link
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Profile;

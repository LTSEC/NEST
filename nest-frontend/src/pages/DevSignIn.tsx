import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AUTH_TOKEN_EXPIRY_HOURS, authenticateWithUsersTable } from '../auth';
import { useAuth } from '../providers/AuthProvider';
import ThemeToggle from '../components/ThemeToggle';

const DevSignIn: React.FC = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const result = await authenticateWithUsersTable(username, password, 'developer');
    if (!result) {
      setError('Invalid developer credentials. Use the seeded "Developer" user to try the flow.');
      return;
    }

    await login(result.token, result.user);

    navigate('/');
  };

  return (
    <div className="relative grid min-h-screen grid-cols-1 bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-white md:grid-cols-2">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>
      <div className="flex items-center justify-center bg-slate-900 p-12 text-white">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full border border-indigo-300/70 bg-indigo-300/30 text-lg font-semibold uppercase tracking-wide text-indigo-100">
            Dev
          </div>
          <div className="space-y-2">
            <p className="text-2xl font-semibold">Developer tools</p>
            <p className="text-sm text-slate-200">
              Access build tools, analytics, and testing sandboxes to keep your games running smoothly.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center bg-white p-8 dark:bg-slate-950 md:p-12">
        <div className="w-full max-w-md space-y-8">
          <header className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Developer sign in</p>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Enter your sandbox</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Use your developer credentials to continue. Session tokens expire after {AUTH_TOKEN_EXPIRY_HOURS} hours.
            </p>
          </header>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                name="username"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/30"
                placeholder="Enter your username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/30"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <button
              type="submit"
              className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              Sign In
            </button>
          </form>

          <div className="text-sm text-slate-600 dark:text-slate-400">
            Looking for the player portal?{' '}
            <Link to="/signin" className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
              Go to user sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DevSignIn;

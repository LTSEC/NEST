import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AUTH_TOKEN_EXPIRY_HOURS, authenticateWithUsersTable } from '../auth';
import { useAuth } from '../providers/AuthProvider';
import ThemeToggle from '../components/ThemeToggle';

const SignIn: React.FC = () => {
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

    const result = await authenticateWithUsersTable(username, password, 'user');
    if (!result) {
      setError('Invalid username or password. Use the seeded "Test" user to try the flow.');
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
      <div className="flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-12 text-white">
        <div className="flex max-w-md flex-col items-center gap-6 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-400/20 to-yellow-500/10 text-lg font-bold uppercase tracking-wide text-yellow-200 border border-yellow-300/30">
            Logo
          </div>
          <div className="space-y-3">
            <p className="text-3xl font-bold tracking-tight">Welcome back</p>
            <p className="text-sm leading-relaxed text-slate-300">
              A bold canvas ready for your bright yellow logo and a concise pitch for your platform.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center bg-white p-8 dark:bg-slate-950 md:p-12">
        <div className="w-full max-w-md space-y-8">
          <header className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Sign in</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Access your account</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Use your workspace credentials to continue. Session tokens expire after {AUTH_TOKEN_EXPIRY_HOURS} hours.
            </p>
          </header>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                name="username"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
                placeholder="Enter your username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm transition-colors focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 hover:shadow-md hover:shadow-indigo-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              Sign In
            </button>
          </form>

          <div className="text-sm text-slate-500 dark:text-slate-400">
            Looking for developer tools?{' '}
            <Link to="/dev-signin" className="font-semibold text-indigo-600 transition-colors hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
              Developer Portal
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignIn;

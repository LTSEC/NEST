import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AUTH_TOKEN_EXPIRY_HOURS } from '../auth';
import { useAuth } from '../providers/AuthProvider';

const SignInPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [token, setToken] = useState('demo-token');

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await login(token || 'demo-token');
    navigate('/');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-800">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">
          Paste a JWT or session token. The token is stored in a cookie that expires in {AUTH_TOKEN_EXPIRY_HOURS} hours. The
          verification logic is stubbed to look up a user record in Postgres when available.
        </p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700" htmlFor="token">
            Token
            <input
              id="token"
              name="token"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="demo-token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>

          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
};

export default SignInPage;

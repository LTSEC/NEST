import React from 'react';
import { useAuth } from '../providers/AuthProvider';

const HomePage: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-indigo-600">Nest Frontend</p>
          <h1 className="text-2xl font-bold text-slate-900">Welcome</h1>
        </div>
        {user && (
          <div className="flex items-center gap-3 rounded-full bg-indigo-50 px-4 py-2 text-indigo-700">
            <span className="font-medium">{user.name}</span>
            <button
              type="button"
              onClick={logout}
              className="rounded-md border border-indigo-200 px-3 py-1 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100"
            >
              Sign out
            </button>
          </div>
        )}
      </header>

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">Routing placeholder</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Authenticated users reach this page through the private route guard. Replace the placeholder copy with your
          application content once the backend token verification endpoint is available.
        </p>
      </section>
    </div>
  );
};

export default HomePage;

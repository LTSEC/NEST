import React from 'react';
import { useAuth } from '../providers/AuthProvider';
import NavBar from '../components/NavBar';

const HomePage: React.FC = () => {
  const { user, logout } = useAuth();
  const role = user?.role ?? 'user';

  return (
    <div className="min-h-screen bg-slate-50">
      {user && <NavBar role={role} userName={user.name} onLogout={logout} />}

      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <header className="space-y-2">
          <p className="text-sm font-semibold text-indigo-600">Nest Frontend</p>
          <h1 className="text-2xl font-bold text-slate-900">Welcome</h1>
          <p className="text-sm text-slate-600">{role === 'developer' ? 'Developer dashboard' : 'User dashboard'}</p>
        </header>

        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Routing placeholder</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Authenticated users reach this page through the private route guard. Replace the placeholder copy with your
            application content once the backend token verification endpoint is available.
          </p>
        </section>
      </div>
    </div>
  );
};

export default HomePage;

import React from 'react';
import NavBar from '../components/NavBar';
import { useAuth } from '../providers/AuthProvider';
import ComingSoon from './partials/ComingSoon';

const DeveloperHome: React.FC = () => {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <NavBar role="developer" userName={user.name} onLogout={logout} />
      <main className="mx-auto max-w-5xl p-6">
        <ComingSoon
          title="Developer Dashboard"
          description="Use the navigation to jump into My Games or explore upcoming areas like Analytics and Game Lists."
        />
      </main>
    </div>
  );
};

export default DeveloperHome;

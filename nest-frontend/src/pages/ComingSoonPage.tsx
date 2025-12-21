import React from 'react';
import AppNav from '../components/AppNav';
import NavBar from '../components/NavBar';
import { useAuth } from '../providers/AuthProvider';
import ComingSoon from './partials/ComingSoon';

const ComingSoonPage: React.FC<{ title: string; description?: string }> = ({ title, description }) => {
  const { user, logout } = useAuth();
  const isDeveloper = user?.role === 'developer';

  return (
    <div className="min-h-screen bg-slate-50">
      {isDeveloper ? <NavBar role="developer" userName={user?.name} onLogout={logout} /> : <AppNav />}
      <main className="mx-auto max-w-5xl p-6">
        <ComingSoon title={title} description={description ?? 'This area is being prepared.'} />
      </main>
    </div>
  );
};

export default ComingSoonPage;

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { mainNavItems } from '../navigation/navItems';
import ProfileMenu from './ProfileMenu';
import ThemeToggle from './ThemeToggle';

const AppNav: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const initial = user?.name?.trim()[0]?.toUpperCase() ?? '?';

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-8">
          <Link to="/" className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Nest
          </Link>

          <div className="flex items-center gap-1 text-sm font-medium">
            {mainNavItems.map((item) => {
              const isActive = location.pathname === item.to;

              return (
                <Link
                  key={item.label}
                  to={item.to}
                  className={`rounded-lg px-3 py-2 transition-all ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user && (
            <ProfileMenu
              initial={initial}
              items={[
                { label: 'Edit Profile', to: '/profile' },
                { label: 'Sign out', onClick: logout },
              ]}
            />
          )}
        </div>
      </div>
    </nav>
  );
};

export default AppNav;

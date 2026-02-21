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
    <nav className="border-b border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <span className="text-lg font-semibold text-slate-900 dark:text-white">Nest</span>

          <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            {mainNavItems.map((item) => {
              const isActive = location.pathname === item.to;

              return (
                <Link
                  key={item.label}
                  to={item.to}
                  className={`rounded-md px-3 py-2 transition ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-500/20 dark:text-indigo-300 dark:ring-indigo-500/30'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
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

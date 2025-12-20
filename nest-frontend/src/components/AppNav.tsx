import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { mainNavItems } from '../navigation/navItems';

const AppNav: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();

  const initial = user?.name?.trim()[0]?.toUpperCase() ?? '?';

  return (
    <nav className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <span className="text-lg font-semibold text-slate-900">Nest</span>

          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            {mainNavItems.map((item) => {
              const isActive = location.pathname === item.to;

              return (
                <Link
                  key={item.label}
                  to={item.to}
                  className={`rounded-md px-3 py-2 transition ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <Link
          to="/profile"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          aria-label="Profile"
        >
          {initial}
        </Link>
      </div>
    </nav>
  );
};

export default AppNav;

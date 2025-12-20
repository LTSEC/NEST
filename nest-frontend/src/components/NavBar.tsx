import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { UserRole } from '../auth';

export type NavBarProps = {
  role: UserRole;
  userName?: string;
  onLogout?: () => void;
};

type NavItem = {
  label: string;
  to: string;
};

const navItemsByRole: Record<UserRole, NavItem[]> = {
  user: [{ label: 'Home', to: '/' }],
  developer: [
    { label: 'Dashboard', to: '/' },
    { label: 'My Games', to: '/my-games' },
    { label: 'Game List', to: '/games' },
    { label: 'Team List', to: '/teams' },
    { label: 'My CTFs', to: '/ctfs' },
    { label: 'Analytics', to: '/analytics' },
  ],
};

const NavBar: React.FC<NavBarProps> = ({ role, onLogout, userName }) => {
  const location = useLocation();
  const navItems = navItemsByRole[role] ?? navItemsByRole.user;

  return (
    <nav className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <div className="text-lg font-semibold text-indigo-700">Nest Dev Portal</div>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            {navItems.map((item) => {
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

        {userName && (
          <div className="flex items-center gap-3 text-sm font-medium text-slate-700">
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">{userName}</span>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
              >
                Sign out
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};

export default NavBar;

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { UserRole } from '../auth';
import ProfileMenu from './ProfileMenu';
import ThemeToggle from './ThemeToggle';

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
  user: [
    { label: 'Dashboard', to: '/app' },
    { label: 'Teams', to: '/teams' },
    { label: 'Games', to: '/games' },
  ],
  developer: [
    { label: 'Dashboard', to: '/developer' },
    { label: 'My Games', to: '/my-games' },
    { label: 'Archives', to: '/archives' },
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
    <nav className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-8">
          <Link to={role === 'developer' ? '/developer' : '/'} className="text-lg font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
            Nest<span className="ml-1 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Dev</span>
          </Link>
          <div className="flex items-center gap-1 text-sm font-medium">
            {navItems.map((item) => {
              const isActive =
                location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
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
          {userName && (
            <ProfileMenu
              initial={userName.trim()[0]?.toUpperCase() ?? '?'}
              items={[
                { label: 'Edit Profile', to: '/profile' },
                { label: 'Sign out', onClick: onLogout },
              ]}
            />
          )}
        </div>
      </div>
    </nav>
  );
};

export default NavBar;

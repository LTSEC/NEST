import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

export type ProfileMenuItem = {
  label: string;
  to?: string;
  onClick?: () => void;
};

export type ProfileMenuProps = {
  initial: string;
  items: ProfileMenuItem[];
};

const ProfileMenu: React.FC<ProfileMenuProps> = ({ initial, items }) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAction = (action?: () => void) => {
    if (action) {
      action();
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md hover:shadow-indigo-500/25 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:ring-offset-2 focus:ring-offset-white dark:from-indigo-500 dark:to-indigo-600 dark:focus:ring-offset-slate-900"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-44 animate-slide-down overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-200/50 dark:border-slate-700 dark:bg-slate-800 dark:shadow-black/20">
          <ul className="py-1 text-sm text-slate-700 dark:text-slate-200">
            {items.map((item) => {
              if (item.to) {
                return (
                  <li key={item.label}>
                    <Link
                      to={item.to}
                      className="block px-4 py-2.5 transition-colors hover:bg-slate-50 hover:text-indigo-600 dark:hover:bg-slate-700/50 dark:hover:text-indigo-400"
                      onClick={() => setOpen(false)}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              }

              return (
                <li key={item.label}>
                  <button
                    type="button"
                    className="flex w-full px-4 py-2.5 text-left transition-colors hover:bg-slate-50 hover:text-indigo-600 dark:hover:bg-slate-700/50 dark:hover:text-indigo-400"
                    onClick={() => handleAction(item.onClick)}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ProfileMenu;

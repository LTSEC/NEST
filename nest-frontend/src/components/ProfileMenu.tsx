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
        className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg ring-1 ring-black/5">
          <ul className="py-1 text-sm text-slate-700">
            {items.map((item) => {
              if (item.to) {
                return (
                  <li key={item.label}>
                    <Link
                      to={item.to}
                      className="block px-4 py-2 transition hover:bg-indigo-50 hover:text-indigo-700"
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
                    className="flex w-full px-4 py-2 text-left transition hover:bg-indigo-50 hover:text-indigo-700"
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

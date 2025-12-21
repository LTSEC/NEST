import React from 'react';

const routerItems = ['Blank', 'VyOS', 'MikroTik'];
const hostItems = ['Blank', 'Debian', 'Ubuntu', 'UbuntuVNC', 'KaliVNC'];

interface ResourceDrawerProps {
  open: boolean;
  onToggle: () => void;
}

const ResourceDrawer: React.FC<ResourceDrawerProps> = ({ open, onToggle }) => {
  return (
    <div className="pointer-events-auto absolute left-0 top-0 z-30 h-full">
      <div
        className="relative flex h-full max-h-[calc(100vh-72px)] w-72 flex-col overflow-visible rounded-r-xl border border-white/10 bg-slate-900/85 backdrop-blur transition-transform duration-300"
        style={{ transform: open ? 'translateX(0)' : 'translateX(calc(-100% + 24px))' }}
        onWheel={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">
          <span>Resources</span>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3 text-sm text-slate-100">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-slate-400">Routers</div>
            <div className="flex flex-wrap gap-2">
              {routerItems.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-medium text-white shadow-sm transition hover:border-white/30 hover:bg-white/10"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-slate-400">Hosts</div>
            <div className="flex flex-wrap gap-2">
              {hostItems.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-medium text-white shadow-sm transition hover:border-white/30 hover:bg-white/10"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button
          type="button"
          aria-label={open ? 'Collapse resource drawer' : 'Expand resource drawer'}
          aria-expanded={open}
          onClick={onToggle}
          className={`absolute top-6 -right-4 flex h-10 w-9 items-center justify-center rounded-r-lg border border-white/10 bg-slate-900/85 text-white shadow-lg transition hover:bg-slate-800 ${open ? 'shadow-sky-500/30' : 'shadow-white/10'}`}
        >
          <span className={`transition-transform ${open ? 'rotate-180' : ''}`}>&#x25C0;</span>
        </button>
      </div>
    </div>
  );
};

export default ResourceDrawer;

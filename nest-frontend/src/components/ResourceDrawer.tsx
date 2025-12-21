import React from 'react';

type ResourceKind = 'router' | 'host';

interface ResourceItem {
  label: string;
  kind: ResourceKind;
}

const routerItems: ResourceItem[] = [
  { label: 'Blank', kind: 'router' },
  { label: 'VyOS', kind: 'router' },
  { label: 'MikroTik', kind: 'router' },
];

const hostItems: ResourceItem[] = [
  { label: 'Blank', kind: 'host' },
  { label: 'Debian', kind: 'host' },
  { label: 'Ubuntu', kind: 'host' },
  { label: 'UbuntuVNC', kind: 'host' },
  { label: 'KaliVNC', kind: 'host' },
];

interface ResourceDrawerProps {
  open: boolean;
  onToggle: () => void;
  onStartDrag: (item: ResourceItem) => void;
}

const ResourceDrawer: React.FC<ResourceDrawerProps> = ({ open, onToggle, onStartDrag }) => {
  const handleDragStart = (event: React.DragEvent<HTMLButtonElement>, item: ResourceItem) => {
    event.dataTransfer.setData('application/nest-node-kind', item.kind);
    event.dataTransfer.setData('application/nest-node-label', item.label);
    event.dataTransfer.effectAllowed = 'copy';
    onStartDrag(item);
  };

  return (
    <div className="pointer-events-auto absolute bottom-0 left-0 right-0 z-30 flex justify-center">
      <div
        className="relative flex w-full max-w-5xl flex-col overflow-visible rounded-t-xl border border-white/10 bg-slate-900/85 backdrop-blur transition-transform duration-300"
        style={{ transform: open ? 'translateY(0)' : 'translateY(calc(100% - 40px))' }}
        onWheel={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">
          <span>Resources</span>
        </div>
        <div className="flex max-h-[40vh] flex-col space-y-4 overflow-y-auto px-4 py-3 text-sm text-slate-100">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-slate-400">Routers</div>
            <div className="flex flex-wrap gap-2">
              {routerItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  draggable
                  onDragStart={(event) => handleDragStart(event, item)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-medium text-white shadow-sm transition hover:border-sky-300/40 hover:bg-white/15"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-slate-400">Hosts</div>
            <div className="flex flex-wrap gap-2">
              {hostItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  draggable
                  onDragStart={(event) => handleDragStart(event, item)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-medium text-white shadow-sm transition hover:border-emerald-300/40 hover:bg-white/15"
                >
                  {item.label}
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
          className={`absolute -top-10 left-1/2 flex h-10 w-12 -translate-x-1/2 items-center justify-center rounded-t-lg border border-white/10 bg-slate-900/85 text-white shadow-lg transition hover:bg-slate-800 ${open ? 'shadow-sky-500/30' : 'shadow-white/10'}`}
        >
          <span className="text-lg">{open ? '\u25BC' : '\u25B2'}</span>
        </button>
      </div>
    </div>
  );
};

export default ResourceDrawer;

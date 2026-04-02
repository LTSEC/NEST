import React from 'react';
import { NetworkItem, networkItemsByCategory } from '../data/networkItems';
import { customServiceCatalog } from '../data/services';

interface ResourceDrawerProps {
  open: boolean;
  onToggle: () => void;
  onStartDrag: (item: NetworkItem) => void;
  onSelectCustomService: (serviceId: string) => void;
  activeCustomServiceIds: string[];
}

const ResourceDrawer: React.FC<ResourceDrawerProps> = ({
  open,
  onToggle,
  onStartDrag,
  onSelectCustomService,
  activeCustomServiceIds,
}) => {
  const handleDragStart = (event: React.DragEvent<HTMLButtonElement>, item: NetworkItem) => {
    event.dataTransfer.setData('application/nest-node-kind', item.category);
    event.dataTransfer.setData('application/nest-node-label', item.label);
    event.dataTransfer.setData('application/nest-node-image-id', item.id);
    event.dataTransfer.effectAllowed = 'copy';
    onStartDrag(item);
  };

  return (
    <div className="pointer-events-auto absolute bottom-0 left-0 right-0 z-30 flex justify-center">
      <div
        className="relative flex w-full max-w-5xl flex-col overflow-visible rounded-t-2xl border border-b-0 border-white/10 bg-slate-900/90 shadow-2xl shadow-black/40 backdrop-blur-xl transition-transform duration-300"
        style={{ transform: open ? 'translateY(0)' : 'translateY(calc(100% - 40px))' }}
        onWheel={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 text-sm font-semibold text-white">
          <span className="tracking-wide">Resources</span>
          <span className="text-xs text-slate-400">Drag to canvas</span>
        </div>
        <div className="flex max-h-[40vh] flex-col space-y-5 overflow-y-auto px-5 py-4 text-sm text-slate-100">
          <div className="space-y-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Routers</div>
            <div className="flex flex-wrap gap-2">
              {networkItemsByCategory.router.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  draggable
                  onDragStart={(event) => handleDragStart(event, item)}
                  data-item-id={item.id}
                  className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-left font-medium text-white transition-all hover:border-sky-400/30 hover:bg-sky-500/10 hover:shadow-lg hover:shadow-sky-500/10"
                >
                  <div className="text-sm font-semibold">{item.label}</div>
                  <div className="text-[10px] font-medium text-slate-400">ID: {item.id}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Hosts</div>
            <div className="flex flex-wrap gap-2">
              {networkItemsByCategory.host.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  draggable
                  onDragStart={(event) => handleDragStart(event, item)}
                  data-item-id={item.id}
                  className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-left font-medium text-white transition-all hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:shadow-lg hover:shadow-emerald-500/10"
                >
                  <div className="text-sm font-semibold">{item.label}</div>
                  <div className="text-[10px] font-medium text-slate-400">ID: {item.id}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Custom services</div>
            <div className="flex flex-wrap gap-2">
              {customServiceCatalog.map((service) => {
                const exists = activeCustomServiceIds.includes(service.id);
                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => onSelectCustomService(service.id)}
                    disabled={exists}
                    className={`rounded-xl border px-3.5 py-2.5 text-left font-medium transition-all ${
                      exists
                        ? 'cursor-not-allowed border-white/5 bg-white/5 text-slate-500'
                        : 'border-white/10 bg-white/5 text-white hover:border-amber-400/30 hover:bg-amber-500/10 hover:shadow-lg hover:shadow-amber-500/10'
                    }`}
                  >
                    <div className="text-sm font-semibold">{service.name}</div>
                    <div className="text-[10px] font-medium text-slate-400">{service.id}</div>
                    <div className="mt-0.5 text-[11px] text-slate-300">{service.description}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <button
          type="button"
          aria-label={open ? 'Collapse resource drawer' : 'Expand resource drawer'}
          aria-expanded={open}
          onClick={onToggle}
          className={`absolute -top-10 left-1/2 flex h-10 w-14 -translate-x-1/2 items-center justify-center rounded-t-xl border border-b-0 border-white/10 bg-slate-900/90 text-white shadow-lg backdrop-blur-xl transition-all hover:bg-slate-800 ${open ? 'shadow-sky-500/20' : 'shadow-white/5'}`}
        >
          <span className="text-lg">{open ? '\u25BC' : '\u25B2'}</span>
        </button>
      </div>
    </div>
  );
};

export default ResourceDrawer;

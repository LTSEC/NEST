import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ResourceDrawer from '../components/ResourceDrawer';
import { getGameById } from '../data/games';
import { useAuth } from '../providers/AuthProvider';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface NetworkNode {
  id: string;
  label: string;
  kind: 'router' | 'host';
  x: number;
  y: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
}

const createId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10));

const NetworkEditor: React.FC = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isDeveloper = user?.role === 'developer';

  const game = useMemo(() => (gameId ? getGameById(gameId) : undefined), [gameId]);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [nodes, setNodes] = useState<NetworkNode[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const offsetOrigin = useRef({ x: 0, y: 0 });
  const nodeDragOrigin = useRef({ x: 0, y: 0 });
  const nodeStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!isDeveloper) {
      navigate('/');
    }
  }, [isDeveloper, navigate]);

  const screenToWorld = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - offset.x) / scale,
      y: (clientY - rect.top - offset.y) / scale,
    };
  };

  const handleCanvasMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    setContextMenu(null);
    setIsPanning(true);
    dragOrigin.current = { x: event.clientX, y: event.clientY };
    offsetOrigin.current = { ...offset };
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (draggingNodeId) {
      const world = screenToWorld(event.clientX, event.clientY);
      const dx = world.x - nodeDragOrigin.current.x;
      const dy = world.y - nodeDragOrigin.current.y;
      setNodes((current) =>
        current.map((node) =>
          node.id === draggingNodeId ? { ...node, x: nodeStart.current.x + dx, y: nodeStart.current.y + dy } : node,
        ),
      );
      return;
    }

    if (!isPanning) return;
    const deltaX = event.clientX - dragOrigin.current.x;
    const deltaY = event.clientY - dragOrigin.current.y;
    setOffset({ x: offsetOrigin.current.x + deltaX, y: offsetOrigin.current.y + deltaY });
  };

  const stopDragging = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setContextMenu(null);
    const direction = event.deltaY > 0 ? -0.1 : 0.1;
    setScale((current) => clamp(Number((current + direction).toFixed(2)), 0.5, 2.5));
  };

  const zoomIn = () => setScale((current) => clamp(Number((current + 0.1).toFixed(2)), 0.5, 2.5));
  const zoomOut = () => setScale((current) => clamp(Number((current - 0.1).toFixed(2)), 0.5, 2.5));
  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData('application/nest-node-kind') as NetworkNode['kind'];
    const label = event.dataTransfer.getData('application/nest-node-label');
    if (!kind || !label) return;

    const point = screenToWorld(event.clientX, event.clientY);
    setNodes((current) => [...current, { id: createId(), kind, label, x: point.x, y: point.y }]);
    setContextMenu(null);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes('application/nest-node-kind')) {
      event.preventDefault();
    }
  };

  const handleNodeMouseDown = (event: React.MouseEvent<HTMLDivElement>, node: NetworkNode) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setContextMenu(null);
    setDraggingNodeId(node.id);
    const world = screenToWorld(event.clientX, event.clientY);
    nodeDragOrigin.current = world;
    nodeStart.current = { x: node.x, y: node.y };
  };

  const handleNodeContextMenu = (event: React.MouseEvent<HTMLDivElement>, node: NetworkNode) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  };

  const deleteNode = (id: string) => {
    setNodes((current) => current.filter((node) => node.id !== id));
    setContextMenu(null);
  };

  const duplicateNode = (id: string) => {
    setNodes((current) => {
      const node = current.find((item) => item.id === id);
      if (!node) return current;
      const duplicate: NetworkNode = {
        ...node,
        id: createId(),
        x: node.x + 40,
        y: node.y + 40,
        label: `${node.label} copy`,
      };
      return [...current, duplicate];
    });
    setContextMenu(null);
  };

  const viewBox = useMemo(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return {
      x: (-offset.x) / scale,
      y: (-offset.y) / scale,
      width: rect ? rect.width / scale : 0,
      height: rect ? rect.height / scale : 0,
    };
  }, [offset, scale]);

  const minimap = useMemo(() => {
    const padding = 12;
    const mapWidth = 220;
    const mapHeight = 140;
    const allX = nodes.length ? nodes.map((node) => node.x) : [0];
    const allY = nodes.length ? nodes.map((node) => node.y) : [0];
    allX.push(viewBox.x, viewBox.x + viewBox.width);
    allY.push(viewBox.y, viewBox.y + viewBox.height);

    const minX = Math.min(...allX) - padding;
    const maxX = Math.max(...allX) + padding;
    const minY = Math.min(...allY) - padding;
    const maxY = Math.max(...allY) + padding;

    const contentWidth = Math.max(maxX - minX, 1);
    const contentHeight = Math.max(maxY - minY, 1);
    const scaleFactor = Math.min((mapWidth - padding * 2) / contentWidth, (mapHeight - padding * 2) / contentHeight);

    const project = (x: number, y: number) => ({
      x: (x - minX) * scaleFactor + padding,
      y: (y - minY) * scaleFactor + padding,
    });

    const projectedNodes = nodes.map((node) => ({
      ...project(node.x, node.y),
      id: node.id,
      kind: node.kind,
    }));

    const topLeft = project(viewBox.x, viewBox.y);
    const bottomRight = project(viewBox.x + viewBox.width, viewBox.y + viewBox.height);

    return {
      width: mapWidth,
      height: mapHeight,
      nodes: projectedNodes,
      viewport: {
        x: topLeft.x,
        y: topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y,
      },
    };
  }, [nodes, viewBox]);

  const backgroundStyle = {
    backgroundImage:
      'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.16) 1.2px, transparent 0), radial-gradient(circle at 40px 40px, rgba(80,180,255,0.08) 1px, transparent 0)',
    backgroundSize: '80px 80px, 80px 80px',
    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
  } as const;

  const contentStyle = {
    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
  } as const;

  return (
    <div className="h-screen w-screen bg-slate-950 text-white">
      <div
        ref={canvasRef}
        className="relative h-full w-full overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDragging}
        onMouseLeave={stopDragging}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        role="presentation"
      >
        <div className="absolute left-4 top-4 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-white/20 transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            ← Back
          </button>
          <div className="rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-slate-100 ring-1 ring-white/10">
            {game ? `${game.name} network` : 'Network editor'}
          </div>
        </div>

        <ResourceDrawer open={drawerOpen} onToggle={() => setDrawerOpen((open) => !open)} onStartDrag={() => setContextMenu(null)} />

        <div className="pointer-events-none absolute right-4 top-4 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={zoomOut}
            className="pointer-events-auto rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-white/20 transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            -
          </button>
          <button
            type="button"
            onClick={zoomIn}
            className="pointer-events-auto rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-white/20 transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            +
          </button>
          <button
            type="button"
            onClick={resetView}
            className="pointer-events-auto rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-white/20 transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Reset
          </button>
          <span className="rounded-lg bg-white/10 px-2 py-1 text-xs font-medium text-white ring-1 ring-white/20">{Math.round(scale * 100)}%</span>
        </div>

        <div className="absolute inset-0" aria-label="Network canvas">
          <div className="absolute inset-0" style={backgroundStyle} />

          <div className="absolute inset-0" style={contentStyle}>
            <div className="relative h-full w-full">
              {nodes.map((node) => (
                <div
                  key={node.id}
                  className="absolute"
                  style={{ left: node.x, top: node.y }}
                  onMouseDown={(event) => handleNodeMouseDown(event, node)}
                  onContextMenu={(event) => handleNodeContextMenu(event, node)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.kind} ${node.label}`}
                  onKeyDown={(event) => {
                    if (event.key === 'Delete') deleteNode(node.id);
                  }}
                >
                  <div
                    className={`pointer-events-auto select-none rounded-lg border px-3 py-2 text-sm font-semibold shadow-lg backdrop-blur transition ${node.kind === 'router' ? 'border-sky-400/30 bg-sky-500/20 text-sky-100' : 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100'}`}
                  >
                    <div className="text-[11px] uppercase tracking-wide opacity-80">{node.kind}</div>
                    <div>{node.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-xl bg-black/40 px-6 py-4 text-center text-sm font-medium text-slate-100 ring-1 ring-white/10">
                Drag resources from the drawer onto the canvas. Pan with left click, scroll to zoom, and right click a node to duplicate or delete it.
              </div>
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute bottom-4 right-4 z-30 rounded-lg border border-white/10 bg-black/60 p-3 shadow-lg backdrop-blur">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-200">
            <span>Overview</span>
            <span className="text-[11px] text-slate-400">{nodes.length} nodes</span>
          </div>
          <div className="relative overflow-hidden rounded-md border border-white/10 bg-slate-900/70" style={{ width: minimap.width, height: minimap.height }}>
            <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.12) 1px, transparent 0)', backgroundSize: '24px 24px' }} />
            {minimap.nodes.map((node) => (
              <div
                key={node.id}
                className={`absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm ${node.kind === 'router' ? 'bg-sky-300' : 'bg-emerald-300'}`}
                style={{ left: node.x, top: node.y }}
              />
            ))}
            <div
              className="absolute rounded border border-white/50 bg-white/10"
              style={{
                left: minimap.viewport.x,
                top: minimap.viewport.y,
                width: minimap.viewport.width,
                height: minimap.viewport.height,
              }}
            />
          </div>
        </div>

        {contextMenu && (
          <div
            className="absolute z-40 w-36 rounded-lg border border-white/10 bg-slate-900/95 py-2 text-sm shadow-2xl ring-1 ring-black/60"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              type="button"
              onClick={() => duplicateNode(contextMenu.nodeId)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-100 transition hover:bg-white/10"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => deleteNode(contextMenu.nodeId)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-rose-200 transition hover:bg-rose-500/20"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NetworkEditor;

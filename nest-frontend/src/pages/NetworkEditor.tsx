import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ResourceDrawer from '../components/ResourceDrawer';
import { getGameById } from '../data/games';
import { networkItemsByCategory } from '../data/networkItems';
import { useAuth } from '../providers/AuthProvider';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const MAP_WIDTH = 3200;
const MAP_HEIGHT = 2400;
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;

interface NetworkNode {
  id: string;
  label: string;
  imageId: string;
  kind: 'router' | 'host';
  x: number;
  y: number;
  interfaces: NetworkInterface[];
}

interface NetworkInterface {
  id: string;
  name: string;
  ip?: string;
  networkCidr?: string;
  targetRouterInterfaceId?: string;
}

interface NetworkLinkEnd {
  nodeId: string;
  interfaceId: string;
}

interface NetworkLink {
  id: string;
  from: NetworkLinkEnd;
  to: NetworkLinkEnd;
  networkCidr: string;
}

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
}

const createId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10));

const ipv4ToInt = (ip: string) => {
  const octets = ip.split('.');
  if (octets.length !== 4) return null;
  const values = octets.map((part) => Number(part));
  if (values.some((value) => Number.isNaN(value) || value < 0 || value > 255)) return null;
  return values.reduce((acc, octet) => (acc << 8) + octet, 0);
};

const cidrToRange = (cidr: string): { start: number; end: number } | null => {
  const [network, prefix] = cidr.split('/');
  const mask = Number(prefix);
  if (!network || Number.isNaN(mask) || mask < 0 || mask > 32) return null;
  const address = ipv4ToInt(network);
  if (address === null) return null;
  const hostBits = 32 - mask;
  const rangeSize = hostBits === 32 ? 0 : 2 ** hostBits - 1;
  return { start: address, end: address + rangeSize };
};

const rangesOverlap = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start <= b.end && b.start <= a.end;

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
  const [links, setLinks] = useState<NetworkLink[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [anchorPositions, setAnchorPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [linkInProgress, setLinkInProgress] = useState<{ anchorId: string; point: { x: number; y: number } } | null>(null);
  const [overlappingInterfaces, setOverlappingInterfaces] = useState<Set<string>>(new Set());
  const [invalidHostInterfaces, setInvalidHostInterfaces] = useState<Set<string>>(new Set());
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const offsetOrigin = useRef({ x: 0, y: 0 });
  const nodeDragOrigin = useRef({ x: 0, y: 0 });
  const nodeStart = useRef({ x: 0, y: 0 });
  const anchorRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const createInterface = (name: string): NetworkInterface => ({
    id: createId(),
    name,
  });

  const anchorKey = (nodeId: string, interfaceId: string) => `${nodeId}:${interfaceId}`;

  const constrainOffset = (nextOffset: { x: number; y: number }, nextScale: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return nextOffset;

    const viewWidth = rect.width / nextScale;
    const viewHeight = rect.height / nextScale;

    const clampedX =
      viewWidth >= MAP_WIDTH
        ? -((MAP_WIDTH * nextScale - rect.width) / 2)
        : clamp(nextOffset.x, -(MAP_WIDTH - viewWidth) * nextScale, 0);

    const clampedY =
      viewHeight >= MAP_HEIGHT
        ? -((MAP_HEIGHT * nextScale - rect.height) / 2)
        : clamp(nextOffset.y, -(MAP_HEIGHT - viewHeight) * nextScale, 0);

    return { x: clampedX, y: clampedY };
  };

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
      x: clamp((clientX - rect.left - offset.x) / scale, 0, MAP_WIDTH),
      y: clamp((clientY - rect.top - offset.y) / scale, 0, MAP_HEIGHT),
    };
  };

  const handleCanvasMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, [role="button"], a, input, textarea, select, option')) return;
    setContextMenu(null);
    setSelectedNodeId(null);
    setSelectedLinkId(null);
    setIsPanning(true);
    event.preventDefault();
    dragOrigin.current = { x: event.clientX, y: event.clientY };
    offsetOrigin.current = { ...offset };
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (linkInProgress) {
      const world = screenToWorld(event.clientX, event.clientY);
      setLinkInProgress((current) => (current ? { ...current, point: world } : null));
    }

    if (draggingNodeId) {
      const world = screenToWorld(event.clientX, event.clientY);
      const dx = world.x - nodeDragOrigin.current.x;
      const dy = world.y - nodeDragOrigin.current.y;
      setNodes((current) =>
        current.map((node) =>
          node.id === draggingNodeId
            ? {
                ...node,
                x: clamp(nodeStart.current.x + dx, 0, MAP_WIDTH),
                y: clamp(nodeStart.current.y + dy, 0, MAP_HEIGHT),
              }
            : node,
        ),
      );
      return;
    }

    if (!isPanning) return;
    const deltaX = event.clientX - dragOrigin.current.x;
    const deltaY = event.clientY - dragOrigin.current.y;
    const nextOffset = { x: offsetOrigin.current.x + deltaX, y: offsetOrigin.current.y + deltaY };
    setOffset(constrainOffset(nextOffset, scale));
  };

  const stopDragging = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
    setLinkInProgress(null);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setContextMenu(null);
    const direction = event.deltaY > 0 ? -0.1 : 0.1;
    setScale((current) => clamp(Number((current + direction).toFixed(2)), MIN_SCALE, MAX_SCALE));
  };

  const zoomIn = () => setScale((current) => clamp(Number((current + 0.1).toFixed(2)), MIN_SCALE, MAX_SCALE));
  const zoomOut = () => setScale((current) => clamp(Number((current - 0.1).toFixed(2)), MIN_SCALE, MAX_SCALE));
  const resetView = () => {
    setScale(1);
    setOffset(constrainOffset({ x: 0, y: 0 }, 1));
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData('application/nest-node-kind') as NetworkNode['kind'];
    const label = event.dataTransfer.getData('application/nest-node-label');
    const imageId = event.dataTransfer.getData('application/nest-node-image-id');
    if (!kind || !label || !imageId) return;

    const point = screenToWorld(event.clientX, event.clientY);
    const defaultInterfaces =
      kind === 'router'
        ? [createInterface('eth0'), createInterface('eth1')]
        : [createInterface('eth0')];
    setNodes((current) => [
      ...current,
      {
        id: createId(),
        kind,
        imageId,
        label,
        x: clamp(point.x, 0, MAP_WIDTH),
        y: clamp(point.y, 0, MAP_HEIGHT),
        interfaces: defaultInterfaces,
      },
    ]);
    setContextMenu(null);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes('application/nest-node-kind')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleNodeMouseDown = (event: React.MouseEvent<HTMLDivElement>, node: NetworkNode) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setContextMenu(null);
    setSelectedLinkId(null);
    setSelectedNodeId(node.id);
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
    setLinks((current) => current.filter((link) => link.from.nodeId !== id && link.to.nodeId !== id));
    setNodes((current) => current.filter((node) => node.id !== id));
    if (selectedNodeId === id) {
      setSelectedNodeId(null);
      setSelectedLinkId(null);
    }
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
        interfaces: node.interfaces.map((intf, index) => ({
          ...intf,
          id: createId(),
          name: `${intf.name || 'eth'}${index}`,
        })),
        label: `${node.label} copy`,
      };
      return [...current, duplicate];
    });
    setContextMenu(null);
  };

  const removeInterface = (nodeId: string, interfaceId: string) => {
    setLinks((current) => {
      const filtered = current.filter((link) => link.from.interfaceId !== interfaceId && link.to.interfaceId !== interfaceId);
      setSelectedLinkId((selected) => (selected && !filtered.some((link) => link.id === selected) ? null : selected));
      return filtered;
    });
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId ? { ...node, interfaces: node.interfaces.filter((intf) => intf.id !== interfaceId) } : node,
      ),
    );
  };

  const updateInterface = (
    nodeId: string,
    interfaceId: string,
    updater: (intf: NetworkInterface) => NetworkInterface,
  ) => {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              interfaces: node.interfaces.map((intf) => {
                if (intf.id !== interfaceId) return intf;
                const updated = updater(intf);
                if (node.kind === 'router') {
                  const cidrIp = updated.networkCidr?.split('/')[0];
                  const octets = cidrIp?.split('.');
                  if (octets && octets.length === 4) {
                    octets[3] = '1';
                    updated.ip = octets.join('.');
                  } else if (updated.ip) {
                    const ipParts = updated.ip.split('.');
                    if (ipParts.length === 4) {
                      ipParts[3] = '1';
                      updated.ip = ipParts.join('.');
                    }
                  }
                }
                return updated;
              }),
            }
          : node,
      ),
    );
  };

  const addInterface = (node: NetworkNode) => {
    const existingCount = node.interfaces.length;
    const baseName = 'eth';
    const nextIndex = existingCount;
    const newInterface = createInterface(`${baseName}${nextIndex}`);
    setNodes((current) =>
      current.map((item) => (item.id === node.id ? { ...item, interfaces: [...item.interfaces, newInterface] } : item)),
    );
  };

  const viewBox = useMemo(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const width = rect ? rect.width / scale : 0;
    const height = rect ? rect.height / scale : 0;

    return {
      x: (-offset.x) / scale,
      y: (-offset.y) / scale,
      width,
      height,
    };
  }, [offset, scale]);

  const minimap = useMemo(() => {
    const padding = 12;
    const mapWidth = 220;
    const mapHeight = 140;
    const scaleFactor = Math.min((mapWidth - padding * 2) / MAP_WIDTH, (mapHeight - padding * 2) / MAP_HEIGHT);

    const project = (x: number, y: number) => ({
      x: x * scaleFactor + padding,
      y: y * scaleFactor + padding,
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

  const routerInterfaceOptions = useMemo(
    () =>
      nodes
        .filter((node) => node.kind === 'router')
        .flatMap((node) =>
          node.interfaces.map((intf) => ({
            value: anchorKey(node.id, intf.id),
            label: `${node.label} • ${intf.name}`,
          })),
        ),
    [nodes],
  );

  const mapTransform = {
    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    transformOrigin: 'top left',
  } as const;

  const resolveAnchor = (anchorId: string) => {
    const [nodeId, interfaceId] = anchorId.split(':');
    const node = nodes.find((item) => item.id === nodeId);
    const intf = node?.interfaces.find((item) => item.id === interfaceId);
    return node && intf ? { node, intf } : null;
  };

  const createLinkBetween = (sourceAnchorId: string, targetAnchorId: string) => {
    const source = resolveAnchor(sourceAnchorId);
    const target = resolveAnchor(targetAnchorId);
    if (!source || !target) return;
    if (source.node.id === target.node.id) return;
    if (source.node.kind === 'host' && target.node.kind === 'host') return;

    const alreadyExists = links.some(
      (link) =>
        (link.from.nodeId === source.node.id && link.from.interfaceId === source.intf.id &&
          link.to.nodeId === target.node.id && link.to.interfaceId === target.intf.id) ||
        (link.to.nodeId === source.node.id && link.to.interfaceId === source.intf.id &&
          link.from.nodeId === target.node.id && link.from.interfaceId === target.intf.id),
    );
    if (alreadyExists) return;

    const newLink: NetworkLink = {
      id: createId(),
      from: { nodeId: source.node.id, interfaceId: source.intf.id },
      to: { nodeId: target.node.id, interfaceId: target.intf.id },
      networkCidr: source.intf.networkCidr || target.intf.networkCidr || '172.27.0.0/24',
    };

    setLinks((current) => [...current, newLink]);
    if (!source.intf.networkCidr) updateInterface(source.node.id, source.intf.id, (intf) => ({ ...intf, networkCidr: newLink.networkCidr }));
    if (!target.intf.networkCidr) updateInterface(target.node.id, target.intf.id, (intf) => ({ ...intf, networkCidr: newLink.networkCidr }));
    setSelectedLinkId(newLink.id);
    setSelectedNodeId(null);
  };

  const handleAnchorMouseDown = (event: React.MouseEvent<HTMLDivElement>, anchorId: string) => {
    event.stopPropagation();
    const world = screenToWorld(event.clientX, event.clientY);
    setLinkInProgress({ anchorId, point: world });
    setSelectedLinkId(null);
  };

  const handleAnchorMouseUp = (event: React.MouseEvent<HTMLDivElement>, anchorId: string) => {
    event.stopPropagation();
    if (linkInProgress && linkInProgress.anchorId !== anchorId) {
      createLinkBetween(linkInProgress.anchorId, anchorId);
    }
    setLinkInProgress(null);
  };

  const colorForNetwork = (cidr: string) => {
    let hash = 0;
    for (let i = 0; i < cidr.length; i += 1) {
      hash = (hash * 31 + cidr.charCodeAt(i)) % 360;
    }
    return `hsl(${hash}, 72%, 62%)`;
  };

  const backgroundStyle = {
    backgroundImage:
      'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.16) 1.2px, transparent 0), radial-gradient(circle at 40px 40px, rgba(80,180,255,0.08) 1px, transparent 0)',
    backgroundSize: '80px 80px, 80px 80px',
  } as const;

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedLink = links.find((link) => link.id === selectedLinkId) ?? null;

  const updateLink = (id: string, updater: (link: NetworkLink) => NetworkLink) => {
    setLinks((current) => current.map((link) => (link.id === id ? updater(link) : link)));
  };

  const handleLinkNetworkChange = (id: string, value: string) => {
    updateLink(id, (link) => ({ ...link, networkCidr: value }));
    const link = links.find((item) => item.id === id);
    if (link) {
      updateInterface(link.from.nodeId, link.from.interfaceId, (intf) => ({ ...intf, networkCidr: value }));
      updateInterface(link.to.nodeId, link.to.interfaceId, (intf) => ({ ...intf, networkCidr: value }));
    }
  };

  useEffect(() => {
    setOffset((current) => {
      const constrained = constrainOffset(current, scale);
      if (constrained.x === current.x && constrained.y === current.y) return current;
      return constrained;
    });
  }, [scale]);

  useEffect(() => {
    const routerInterfaces = nodes
      .filter((node) => node.kind === 'router')
      .flatMap((node) =>
        node.interfaces
          .filter((intf) => Boolean(intf.networkCidr))
          .map((intf) => ({ key: anchorKey(node.id, intf.id), range: cidrToRange(intf.networkCidr ?? '') })),
      )
      .filter((entry) => entry.range !== null) as { key: string; range: { start: number; end: number } }[];

    const overlaps = new Set<string>();
    for (let i = 0; i < routerInterfaces.length; i += 1) {
      for (let j = i + 1; j < routerInterfaces.length; j += 1) {
        if (rangesOverlap(routerInterfaces[i].range, routerInterfaces[j].range)) {
          overlaps.add(routerInterfaces[i].key);
          overlaps.add(routerInterfaces[j].key);
        }
      }
    }

    setOverlappingInterfaces(overlaps);
  }, [nodes]);

  useEffect(() => {
    const invalid = new Set<string>();
    const routerAddresses = new Map<string, Set<string>>();
    nodes
      .filter((node) => node.kind === 'router')
      .forEach((node) => {
        node.interfaces.forEach((intf) => {
          if (!intf.networkCidr || !intf.ip) return;
          const routerSet = routerAddresses.get(intf.networkCidr) ?? new Set<string>();
          routerSet.add(intf.ip);
          routerAddresses.set(intf.networkCidr, routerSet);
        });
      });

    const seenHosts = new Map<string, Set<string>>();
    nodes
      .filter((node) => node.kind === 'host')
      .forEach((node) => {
        node.interfaces.forEach((intf) => {
          if (!intf.networkCidr || !intf.ip) return;
          const octets = intf.ip.split('.');
          const anchor = anchorKey(node.id, intf.id);
          if (octets.length === 4) {
            const last = Number(octets[3]);
            if (Number.isNaN(last) || last === 0 || last === 1) {
              invalid.add(anchor);
            }
          }

          const rangeSeen = seenHosts.get(intf.networkCidr) ?? new Set<string>();
          if (rangeSeen.has(intf.ip)) {
            invalid.add(anchor);
          }
          rangeSeen.add(intf.ip);
          seenHosts.set(intf.networkCidr, rangeSeen);

          if (routerAddresses.get(intf.networkCidr)?.has(intf.ip)) {
            invalid.add(anchor);
          }
        });
      });

    setInvalidHostInterfaces(invalid);
  }, [nodes]);

  useLayoutEffect(() => {
    const container = canvasRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const positions: Record<string, { x: number; y: number }> = {};

    Object.entries(anchorRefs.current).forEach(([key, element]) => {
      if (!element) return;
      const anchorRect = element.getBoundingClientRect();
      const centerX = anchorRect.left + anchorRect.width / 2;
      const centerY = anchorRect.top + anchorRect.height / 2;
      positions[key] = {
        x: (centerX - rect.left - offset.x) / scale,
        y: (centerY - rect.top - offset.y) / scale,
      };
    });

    setAnchorPositions(positions);
  }, [nodes, scale, offset]);

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

        <ResourceDrawer
          open={drawerOpen}
          onToggle={() => setDrawerOpen((open) => !open)}
          onStartDrag={(_item) => setContextMenu(null)}
        />

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
          <div className="absolute" style={mapTransform}>
            <div className="relative h-full w-full">
              <div
                className="absolute inset-0 rounded-xl border border-white/20 bg-slate-900/60"
                style={backgroundStyle}
              />
              <div className="absolute inset-0">
                <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}>
                  {links.map((link) => {
                    const start = anchorPositions[anchorKey(link.from.nodeId, link.from.interfaceId)];
                    const end = anchorPositions[anchorKey(link.to.nodeId, link.to.interfaceId)];
                    if (!start || !end) return null;
                    const dx = Math.max(Math.abs(end.x - start.x) * 0.35, 80);
                    const path = `M ${start.x} ${start.y} C ${start.x + dx} ${start.y} ${end.x - dx} ${end.y} ${end.x} ${end.y}`;
                    const color = colorForNetwork(link.networkCidr);
                    const isSelected = selectedLinkId === link.id;
                    const midX = (start.x + end.x) / 2;
                    const midY = (start.y + end.y) / 2;
                    return (
                      <g key={link.id} className="cursor-pointer" onMouseDown={(event) => { event.stopPropagation(); setSelectedLinkId(link.id); setSelectedNodeId(null); }}>
                        <path
                          d={path}
                          fill="none"
                          stroke={color}
                          strokeWidth={isSelected ? 4 : 3}
                          opacity={isSelected ? 0.9 : 0.75}
                          className="drop-shadow-lg"
                        />
                        <text x={midX} y={midY - 6} textAnchor="middle" className="fill-white text-[10px] font-semibold drop-shadow" pointerEvents="none">
                          {link.networkCidr}
                        </text>
                      </g>
                    );
                  })}
                  {linkInProgress && anchorPositions[linkInProgress.anchorId] && (
                    <path
                      d={`M ${anchorPositions[linkInProgress.anchorId].x} ${anchorPositions[linkInProgress.anchorId].y} C ${anchorPositions[linkInProgress.anchorId].x + 60} ${anchorPositions[linkInProgress.anchorId].y} ${linkInProgress.point.x - 60} ${linkInProgress.point.y} ${linkInProgress.point.x} ${linkInProgress.point.y}`}
                      fill="none"
                      stroke="rgba(255,255,255,0.6)"
                      strokeDasharray="6 4"
                      strokeWidth={2}
                    />
                  )}
                </svg>
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
                      className={`pointer-events-auto w-60 select-none rounded-xl border px-3 py-2 text-sm font-semibold shadow-lg backdrop-blur transition ${node.kind === 'router' ? 'border-sky-400/30 bg-sky-500/20 text-sky-100' : 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100'} ${selectedNodeId === node.id ? 'ring-2 ring-white/60' : 'ring-1 ring-black/30'}`}
                    >
                      <div className="text-[11px] uppercase tracking-wide opacity-80">{node.kind}</div>
                      <div className="flex items-center justify-between gap-2">
                        <span>{node.label}</span>
                        <span className="text-[11px] font-medium text-white/80">{node.interfaces.length} ports</span>
                      </div>
                      <div className="text-[10px] font-medium uppercase tracking-wide text-white/70">VM image ID: {node.imageId}</div>

                      <div className="mt-2 space-y-2 text-xs font-normal">
                        {node.interfaces.map((intf, index) => {
                          const key = anchorKey(node.id, intf.id);
                          const anchorSide = node.kind === 'host' ? 'left' : 'right';
                          const hasOverlap = overlappingInterfaces.has(key);
                          return (
                            <div key={intf.id} className="relative flex items-center gap-2">
                              <div
                                ref={(element) => {
                                  if (element) {
                                    anchorRefs.current[key] = element;
                                  } else {
                                    delete anchorRefs.current[key];
                                  }
                                }}
                                className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 ${anchorSide === 'left' ? '-left-4' : '-right-4'} ${hasOverlap ? 'border-rose-300 bg-rose-500' : 'border-white/70 bg-white/80'}`}
                                onMouseDown={(event) => handleAnchorMouseDown(event, key)}
                                onMouseUp={(event) => handleAnchorMouseUp(event, key)}
                                title={hasOverlap ? 'Overlapping network range' : 'Drag to link'}
                              />
                              <div className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1">
                                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-white/80">
                                  <span>{intf.name}</span>
                                  <span className="text-[10px] font-medium text-white/60">{node.kind === 'router' ? 'out' : 'in'}</span>
                                </div>
                                <div className="text-[11px] text-white/90">{intf.ip || 'No IP assigned'}</div>
                                <div className={`text-[10px] ${hasOverlap ? 'text-rose-200' : 'text-slate-200'}`}>
                                  {intf.networkCidr || 'No network'}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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

        {selectedNode && (
          <div className="pointer-events-auto absolute right-4 top-20 z-30 w-80 space-y-3 rounded-lg border border-white/10 bg-slate-900/85 p-4 text-sm shadow-xl backdrop-blur">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-200">
            <span>{selectedNode.kind} configuration</span>
            <button
                type="button"
                onClick={() => setSelectedNodeId(null)}
                className="rounded px-2 py-1 text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                Close
              </button>
            </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400">Node ID</div>
            <div className="mt-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-slate-100">
              {selectedNode.id}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">VM image</div>
            <select
              value={selectedNode.imageId}
              onChange={(event) => {
                const nextImageId = event.target.value;
                const replacement = networkItemsByCategory[selectedNode.kind].find((item) => item.id === nextImageId);
                if (!replacement) return;
                setNodes((current) =>
                  current.map((node) =>
                    node.id === selectedNode.id
                      ? {
                          ...node,
                          imageId: nextImageId,
                          label: replacement.label,
                        }
                      : node,
                  ),
                );
              }}
              className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white outline-none focus:border-sky-400/60"
            >
              {networkItemsByCategory[selectedNode.kind].map((item) => (
                <option key={item.id} value={item.id} className="bg-slate-900 text-slate-100">
                  {item.label} (ID: {item.id})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-400">
              <span>Interfaces</span>
              <button
                type="button"
                onClick={() => addInterface(selectedNode)}
                className="rounded bg-white/10 px-2 py-1 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                + Add {selectedNode.kind === 'router' ? 'port' : 'interface'}
              </button>
            </div>

            <div className="space-y-2">
              {selectedNode.interfaces.map((intf) => {
                const key = anchorKey(selectedNode.id, intf.id);
                const overlapping = overlappingInterfaces.has(key);
                const invalidHost = invalidHostInterfaces.has(key);
                return (
                  <div
                    key={intf.id}
                    className={`rounded-lg border px-3 py-2 ${overlapping || invalidHost ? 'border-rose-400/50 bg-rose-500/10' : 'border-white/10 bg-white/5'}`}
                  >
                    <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-100">
                      {selectedNode.kind === 'host' ? (
                        <select
                          value={intf.targetRouterInterfaceId || ''}
                          onChange={(event) => {
                            const targetId = event.target.value || undefined;
                            const selectedOption = routerInterfaceOptions.find((option) => option.value === targetId);
                            updateInterface(selectedNode.id, intf.id, (current) => ({
                              ...current,
                              targetRouterInterfaceId: targetId,
                              name: selectedOption?.label || current.name,
                            }));
                          }}
                          className="w-44 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-100 outline-none focus:border-emerald-400/60"
                        >
                          <option value="" className="bg-slate-900 text-slate-100">
                            Select router interface
                          </option>
                          {routerInterfaceOptions.map((option) => (
                            <option key={option.value} value={option.value} className="bg-slate-900 text-slate-100">
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={intf.name}
                          onChange={(event) =>
                            updateInterface(selectedNode.id, intf.id, (current) => ({ ...current, name: event.target.value }))
                          }
                          className="w-32 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs outline-none focus:border-sky-400/60"
                        />
                      )}
                      {selectedNode.interfaces.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeInterface(selectedNode.id, intf.id)}
                            className="text-[11px] text-rose-200 transition hover:text-rose-100"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="space-y-2 text-xs text-slate-200">
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] uppercase tracking-wide text-slate-400">IP address</span>
                          <input
                            value={intf.ip || ''}
                            placeholder="192.168.0.10"
                            onChange={(event) =>
                              updateInterface(selectedNode.id, intf.id, (current) => ({ ...current, ip: event.target.value }))
                            }
                            className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs outline-none focus:border-sky-400/60"
                          />
                          {invalidHost && <span className="text-[11px] text-rose-200">Reserved or duplicate IP</span>}
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] uppercase tracking-wide text-slate-400">Network (CIDR)</span>
                          <input
                            value={intf.networkCidr || ''}
                            placeholder="172.27.0.0/24"
                            onChange={(event) =>
                              updateInterface(selectedNode.id, intf.id, (current) => ({
                                ...current,
                                networkCidr: event.target.value,
                              }))
                            }
                            className={`rounded border px-2 py-1 text-xs outline-none focus:border-sky-400/60 ${overlapping ? 'border-rose-400 bg-rose-500/10 text-rose-50' : 'border-white/10 bg-white/5 text-white'}`}
                          />
                          {overlapping && <span className="text-[11px] text-rose-200">Overlaps another router network</span>}
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {selectedLink && (
          <div className="pointer-events-auto absolute right-4 top-[calc(20px+360px)] z-30 w-80 space-y-3 rounded-lg border border-white/10 bg-slate-900/85 p-4 text-sm shadow-xl backdrop-blur">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-200">
              <span>Link metadata</span>
              <button
                type="button"
                onClick={() => setSelectedLinkId(null)}
                className="rounded px-2 py-1 text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="space-y-2 text-xs text-slate-100">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Network range (CIDR)</div>
              <input
                value={selectedLink.networkCidr}
                onChange={(event) => handleLinkNetworkChange(selectedLink.id, event.target.value)}
                className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-xs outline-none focus:border-sky-400/60"
              />
              <div className="rounded bg-white/5 px-2 py-1 text-[11px] text-slate-200">
                Connected: {resolveAnchor(anchorKey(selectedLink.from.nodeId, selectedLink.from.interfaceId))?.node.label} ⇄{' '}
                {resolveAnchor(anchorKey(selectedLink.to.nodeId, selectedLink.to.interfaceId))?.node.label}
              </div>
              <button
                type="button"
                onClick={() => {
                  setLinks((current) => current.filter((link) => link.id !== selectedLink.id));
                  setSelectedLinkId(null);
                }}
                className="mt-2 w-full rounded bg-rose-600/80 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white transition hover:bg-rose-500"
              >
                Delete link
              </button>
            </div>
          </div>
        )}

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

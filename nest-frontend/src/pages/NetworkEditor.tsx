import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ResourceDrawer from '../components/ResourceDrawer';
import { getGameById } from '../data/games';
import { networkItemsByCategory } from '../data/networkItems';
import { loadNetworkSnapshot, saveNetworkSnapshot } from '../data/networkStorage';
import { useAuth } from '../providers/AuthProvider';
import { customServiceCatalog, customServicesById, serviceCatalog, serviceDefinitionsById } from '../data/services';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const MAP_WIDTH = 3200;
const MAP_HEIGHT = 2400;
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const GRID_SIZE = 40;

interface NetworkNode {
  id: string;
  label: string;
  imageId: string;
  kind: 'router' | 'host';
  x: number;
  y: number;
  interfaces: NetworkInterface[];
  services: ServiceInstance[];
}

interface NetworkInterface {
  id: string;
  name: string;
  ip?: string;
  networkCidr?: string;
  targetRouterInterfaceId?: string;
  dhcpEnabled?: boolean;
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

interface ServiceInstance {
  id: string;
  serviceId: string;
  protocol: 'tcp' | 'udp';
  port: number;
  customServiceId?: string;
}

interface CustomServiceInstance {
  id: string;
  definitionId: string;
  roleBindings: Record<string, string | undefined>;
  status: 'complete' | 'incomplete';
}

interface ServiceLink {
  id: string;
  fromHostId: string;
  toHostId: string;
  customServiceId: string;
}

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
}

const createId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10));

const snapToGrid = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;

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
  const [customServices, setCustomServices] = useState<CustomServiceInstance[]>([]);
  const [serviceLinks, setServiceLinks] = useState<ServiceLink[]>([]);
  const [anchorPositions, setAnchorPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [nodeBounds, setNodeBounds] = useState<
    Record<string, { x: number; y: number; width: number; height: number; centerX: number; centerY: number }>
  >({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [linkInProgress, setLinkInProgress] = useState<{ anchorId: string; point: { x: number; y: number } } | null>(null);
  const [overlappingInterfaces, setOverlappingInterfaces] = useState<Set<string>>(new Set());
  const [invalidHostInterfaces, setInvalidHostInterfaces] = useState<Set<string>>(new Set());
  const [gridSnapEnabled, setGridSnapEnabled] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [customServiceModal, setCustomServiceModal] = useState<string | null>(null);
  const [customServiceModalError, setCustomServiceModalError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const offsetOrigin = useRef({ x: 0, y: 0 });
  const nodeDragOrigin = useRef({ x: 0, y: 0 });
  const nodeStart = useRef({ x: 0, y: 0 });
  const anchorRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const surfacePointToward = (
    bounds: { centerX: number; centerY: number; width: number; height: number },
    target: { x: number; y: number },
  ) => {
    const dx = target.x - bounds.centerX;
    const dy = target.y - bounds.centerY;
    if (dx === 0 && dy === 0) {
      return { x: bounds.centerX, y: bounds.centerY };
    }

    const halfWidth = bounds.width / 2;
    const halfHeight = bounds.height / 2;
    const tx = dx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx);
    const ty = dy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy);
    const t = Math.min(tx, ty);

    return {
      x: bounds.centerX + dx * t,
      y: bounds.centerY + dy * t,
    };
  };

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

  useEffect(() => {
    const snapshot = loadNetworkSnapshot(game?.id ?? null);
    if (!snapshot) return;

    setGridSnapEnabled(Boolean(snapshot.gridSnapEnabled));
    setNodes(
      snapshot.nodes.map((node) => ({
        id: node.id,
        label: node.label,
        imageId: node.imageId,
        kind: node.kind,
        x: node.position.x,
        y: node.position.y,
        interfaces: node.interfaces.map((intf) => ({ ...intf })),
        services: (node.services || []).map((service) => ({
          ...service,
          protocol: service.protocol === 'udp' ? 'udp' : 'tcp',
        })),
      })),
    );
    setLinks(snapshot.links.map((link) => ({ ...link })));
    setCustomServices(snapshot.customServices?.map((service) => ({ ...service })) || []);

    const nextScale =
      typeof snapshot.metadata?.scale === 'number' ? clamp(snapshot.metadata.scale, MIN_SCALE, MAX_SCALE) : scale;
    setScale(nextScale);

    if (snapshot.metadata && typeof (snapshot.metadata as Record<string, unknown>).offset === 'object') {
      const offsetValue = (snapshot.metadata as { offset?: { x: number; y: number } }).offset;
      if (offsetValue && typeof offsetValue.x === 'number' && typeof offsetValue.y === 'number') {
        setOffset(constrainOffset({ x: offsetValue.x, y: offsetValue.y }, nextScale));
      }
    }
  }, [game?.id]);

  const screenToWorld = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clamp((clientX - rect.left - offset.x) / scale, 0, MAP_WIDTH),
      y: clamp((clientY - rect.top - offset.y) / scale, 0, MAP_HEIGHT),
    };
  };

  const applyGridSnap = (value: number) => (gridSnapEnabled ? snapToGrid(value) : value);

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
                x: applyGridSnap(clamp(nodeStart.current.x + dx, 0, MAP_WIDTH)),
                y: applyGridSnap(clamp(nodeStart.current.y + dy, 0, MAP_HEIGHT)),
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
        x: applyGridSnap(clamp(point.x, 0, MAP_WIDTH)),
        y: applyGridSnap(clamp(point.y, 0, MAP_HEIGHT)),
        interfaces: defaultInterfaces,
        services: [],
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

  const handleCustomServiceSelection = (definitionId: string) => {
    setCustomServiceModal(definitionId);
    setCustomServiceModalError(null);
  };

  const createCustomServiceEntry = (
    definitionId: string,
    roleBindings: Record<string, string | undefined>,
    status: CustomServiceInstance['status'],
  ) => {
    setCustomServices((current) => {
      if (current.some((service) => service.definitionId === definitionId)) return current;
      return [...current, { id: createId(), definitionId, roleBindings, status }];
    });
  };

  const handleAutoCreateCustomService = (definitionId: string) => {
    const definition = customServicesById[definitionId];
    if (!definition) return;
    if (customServices.some((service) => service.definitionId === definitionId)) {
      setCustomServiceModalError('Only one instance of a custom service can exist at a time.');
      return;
    }

    const baseX = applyGridSnap(clamp(viewBox.x + viewBox.width / 2, 0, MAP_WIDTH));
    const baseY = applyGridSnap(clamp(viewBox.y + viewBox.height / 2, 0, MAP_HEIGHT));
    const roleBindings: Record<string, string | undefined> = {};
    const createdNodes: NetworkNode[] = [];

    (definition.requiredRoles ?? []).forEach((role, index) => {
      const serviceDefinition = serviceDefinitionsById[role.serviceId];
      const hostTemplate =
        networkItemsByCategory.host.find((item) => item.id === role.hostImageId) || networkItemsByCategory.host[0];

      const nodeId = createId();
      const serviceInstance: ServiceInstance = {
        id: createId(),
        serviceId: role.serviceId,
        protocol: serviceDefinition?.protocol === 'udp' ? 'udp' : 'tcp',
        port: role.defaultPort ?? serviceDefinition?.defaultPort ?? 0,
        customServiceId: definitionId,
      };

      createdNodes.push({
        id: nodeId,
        kind: 'host',
        label: `${definition.name} ${role.role}`,
        imageId: hostTemplate?.id ?? '-2',
        x: applyGridSnap(clamp(baseX + index * 140, 0, MAP_WIDTH)),
        y: applyGridSnap(clamp(baseY + index * 120, 0, MAP_HEIGHT)),
        interfaces: [createInterface('eth0')],
        services: [serviceInstance],
      });

      roleBindings[role.role] = nodeId;
    });

    setNodes((current) => [...current, ...createdNodes]);
    createCustomServiceEntry(definitionId, roleBindings, resolveCustomServiceStatus(definitionId, roleBindings));
    setCustomServiceModal(null);
  };

  const handleManualCustomServiceRegistration = (definitionId: string) => {
    const definition = customServicesById[definitionId];
    if (!definition) return;
    if (customServices.some((service) => service.definitionId === definitionId)) {
      setCustomServiceModalError('Only one instance of a custom service can exist at a time.');
      return;
    }

    const bindings: Record<string, string | undefined> = {};
    (definition.requiredRoles ?? []).forEach((role) => {
      bindings[role.role] = undefined;
    });
    createCustomServiceEntry(definitionId, bindings, 'incomplete');
    setCustomServiceModal(null);
  };

  const removeCustomServiceInstance = (customServiceId: string) => {
    setCustomServices((current) => current.filter((service) => service.id !== customServiceId));
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        services: node.services.map((service) =>
          service.customServiceId === customServiceId ? { ...service, customServiceId: undefined } : service,
        ),
      })),
    );
  };

  const handleSaveNetwork = () => {
    setSaveStatus('saving');
    setSaveError(null);

    try {
      const snapshot = {
        gameId: game?.id ?? null,
        savedAt: new Date().toISOString(),
        gridSnapEnabled,
        nodes: nodes.map((node) => ({
          id: node.id,
          label: node.label,
          imageId: node.imageId,
          kind: node.kind,
          position: { x: node.x, y: node.y },
          interfaces: node.interfaces.map((intf) => ({ ...intf })),
          services: node.services.map((service) => ({ ...service })),
        })),
        links: links.map((link) => ({ ...link })),
        metadata: { offset, scale },
        customServices: customServices.map((service) => ({ ...service })),
      };

      saveNetworkSnapshot(game?.id ?? null, snapshot);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      setSaveStatus('error');
      setSaveError(error instanceof Error ? error.message : 'Failed to save network');
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
    setCustomServices((current) =>
      current.map((service) => {
        const nextBindings = Object.fromEntries(
          Object.entries(service.roleBindings).map(([role, hostId]) => [role, hostId === id ? undefined : hostId]),
        );
        const nextStatus = resolveCustomServiceStatus(service.definitionId, nextBindings);
        return { ...service, roleBindings: nextBindings, status: nextStatus };
      }),
    );
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
        services: node.services.map((service) => ({
          ...service,
          id: createId(),
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

  const computeDhcpIp = (
    networkCidr: string | undefined,
    currentNodes: NetworkNode[],
    excludeNodeId: string,
    excludeInterfaceId: string,
  ): string | undefined => {
    if (!networkCidr) return undefined;
    const [network, prefix] = networkCidr.split('/');
    if (!network || !prefix) return undefined;
    const octets = network.split('.');
    if (octets.length !== 4) return undefined;

    // Collect all IPs already in use on this network
    const usedIps = new Set<string>();
    currentNodes.forEach((node) => {
      node.interfaces.forEach((intf) => {
        if (intf.ip && intf.networkCidr === networkCidr) {
          if (node.id !== excludeNodeId || intf.id !== excludeInterfaceId) {
            usedIps.add(intf.ip);
          }
        }
      });
    });

    // Router IP is always .1
    const routerIp = `${octets[0]}.${octets[1]}.${octets[2]}.1`;
    usedIps.add(routerIp);
    // Network address (.0) is reserved
    usedIps.add(`${octets[0]}.${octets[1]}.${octets[2]}.0`);

    // Find next available IP starting from .2
    const mask = parseInt(prefix, 10);
    const maxHosts = mask >= 24 ? Math.pow(2, 32 - mask) - 1 : 254;
    for (let i = 2; i <= Math.min(maxHosts, 254); i++) {
      const candidateIp = `${octets[0]}.${octets[1]}.${octets[2]}.${i}`;
      if (!usedIps.has(candidateIp)) {
        return candidateIp;
      }
    }
    return undefined;
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
                } else if (updated.dhcpEnabled) {
                  // Auto-assign a DHCP IP from the connected router's network
                  const targetNetwork = updated.networkCidr;
                  updated.ip = computeDhcpIp(targetNetwork, current, nodeId, interfaceId);
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

  const routerNetworks = useMemo(() => {
    const mapping: Record<string, string | undefined> = {};
    nodes
      .filter((node) => node.kind === 'router')
      .forEach((node) => {
        node.interfaces.forEach((intf) => {
          mapping[anchorKey(node.id, intf.id)] = intf.networkCidr;
        });
      });
    return mapping;
  }, [nodes]);

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

    const routerEndpoints = [source, target].filter((endpoint) => endpoint.node.kind === 'router');
    const hostEndpoint = source.node.kind === 'host' ? source : target.node.kind === 'host' ? target : null;
    const primaryRouter = routerEndpoints[0];
    const routerNetwork = routerEndpoints.find((endpoint) => endpoint.intf.networkCidr)?.intf.networkCidr;
    const networkCidr = routerNetwork || primaryRouter?.intf.networkCidr || '172.27.0.0/24';

    const newLink: NetworkLink = {
      id: createId(),
      from: { nodeId: source.node.id, interfaceId: source.intf.id },
      to: { nodeId: target.node.id, interfaceId: target.intf.id },
      networkCidr,
    };

    setLinks((current) => [...current, newLink]);
    routerEndpoints.forEach((endpoint) => {
      if (!endpoint.intf.networkCidr) {
        updateInterface(endpoint.node.id, endpoint.intf.id, (intf) => ({ ...intf, networkCidr: newLink.networkCidr }));
      }
    });
    if (hostEndpoint) {
      updateInterface(hostEndpoint.node.id, hostEndpoint.intf.id, (intf) => ({
        ...intf,
        networkCidr: newLink.networkCidr,
        targetRouterInterfaceId: primaryRouter ? anchorKey(primaryRouter.node.id, primaryRouter.intf.id) : intf.targetRouterInterfaceId,
      }));
    }
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
  const vmImageOptions = useMemo(() => {
    if (!selectedNode) return [];
    const seen = new Set<string>();
    return networkItemsByCategory[selectedNode.kind].filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [selectedNode]);

  const servicePortConflicts = useMemo(() => {
    const conflicts = new Set<string>();
    nodes.forEach((node) => {
      const seen = new Map<string, string>();
      node.services.forEach((service) => {
        const key = `${service.protocol}:${service.port}`;
        if (seen.has(key)) {
          conflicts.add(service.id);
          conflicts.add(seen.get(key) as string);
        } else {
          seen.set(key, service.id);
        }
      });
    });
    return conflicts;
  }, [nodes]);

  const resolveCustomServiceStatus = (
    definitionId: string,
    bindings: Record<string, string | undefined>,
  ): CustomServiceInstance['status'] => {
    const definition = customServicesById[definitionId];
    if (!definition) return 'incomplete';
    const dependenciesMet = (definition.dependencies ?? []).every((dependencyId) =>
      nodes.some((node) => node.services.some((service) => service.serviceId === dependencyId)),
    );
    if (!dependenciesMet) return 'incomplete';

    const complete = (definition.requiredRoles ?? []).every((role) => {
      const hostId = bindings[role.role];
      if (!hostId) return false;
      const host = nodes.find((node) => node.id === hostId);
      return Boolean(host && host.services.some((service) => service.serviceId === role.serviceId));
    });
    return complete ? 'complete' : 'incomplete';
  };

  const describeCustomServiceIssues = (
    definitionId: string,
    bindings: Record<string, string | undefined>,
  ): string[] => {
    const definition = customServicesById[definitionId];
    if (!definition) return ['Missing service definition'];

    const issues: string[] = [];

    const missingDependencies = (definition.dependencies ?? []).filter(
      (dependencyId) => !nodes.some((node) => node.services.some((service) => service.serviceId === dependencyId)),
    );
    missingDependencies.forEach((dependencyId) => {
      issues.push(`Dependency not present: ${serviceDefinitionsById[dependencyId]?.name ?? dependencyId}`);
    });

    (definition.requiredRoles ?? []).forEach((role) => {
      const hostId = bindings[role.role];
      if (!hostId) {
        issues.push(`Unassigned role: ${role.role}`);
        return;
      }
      const host = nodes.find((node) => node.id === hostId);
      if (!host) {
        issues.push(`Missing host for role ${role.role}`);
        return;
      }
      const hasService = host.services.some((service) => service.serviceId === role.serviceId);
      if (!hasService) {
        issues.push(`Required service not enabled on ${host.label}: ${serviceDefinitionsById[role.serviceId]?.name ?? role.serviceId}`);
      }
    });

    return issues;
  };

  const updateNodeServices = (nodeId: string, updater: (services: ServiceInstance[]) => ServiceInstance[]) => {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              services: updater(node.services ?? []),
            }
          : node,
      ),
    );
  };

  const toggleServiceForNode = (nodeId: string, definitionId: string, enabled: boolean, customServiceId?: string) => {
    const definition = serviceDefinitionsById[definitionId];
    if (!definition) return;

    if (enabled) {
      updateNodeServices(nodeId, (services) => {
        if (services.some((service) => service.serviceId === definitionId)) return services;
        const defaultPort = Number.isFinite(definition.defaultPort) ? Number(definition.defaultPort) : 0;
        return [
          ...services,
          {
            id: createId(),
            serviceId: definitionId,
            protocol: definition.protocol === 'udp' ? 'udp' : 'tcp',
            port: defaultPort,
            customServiceId,
          },
        ];
      });
    } else {
      updateNodeServices(nodeId, (services) => services.filter((service) => service.serviceId !== definitionId));
    }
  };

  const updateServicePort = (nodeId: string, definitionId: string, value: number) => {
    const normalized = Number.isNaN(value) ? 0 : value;
    updateNodeServices(nodeId, (services) =>
      services.map((service) =>
        service.serviceId === definitionId
          ? {
              ...service,
              port: normalized,
            }
          : service,
      ),
    );
  };

  const attachHostToCustomRole = (customServiceId: string, role: string, hostId: string) => {
    setCustomServices((current) =>
      current.map((item) => {
        if (item.id !== customServiceId) return item;
        const nextBindings = { ...item.roleBindings, [role]: hostId };
        const nextStatus = resolveCustomServiceStatus(item.definitionId, nextBindings);
        return { ...item, roleBindings: nextBindings, status: nextStatus };
      }),
    );
  };

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
          if (!intf.networkCidr || intf.dhcpEnabled || !intf.ip) return;
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

  useEffect(() => {
    setCustomServices((current) =>
      current.map((service) => {
        const nextStatus = resolveCustomServiceStatus(service.definitionId, service.roleBindings);
        return nextStatus !== service.status ? { ...service, status: nextStatus } : service;
      }),
    );
  }, [nodes]);

  useEffect(() => {
    let changed = false;
    const nextNodes = nodes.map((node) => {
      if (node.kind !== 'host') return node;
      let nodeChanged = false;
      const interfaces = node.interfaces.map((intf) => {
        if (!intf.targetRouterInterfaceId) return intf;
        const nextCidr = routerNetworks[intf.targetRouterInterfaceId];
        if (nextCidr !== intf.networkCidr) {
          nodeChanged = true;
          changed = true;
          const updated = { ...intf, networkCidr: nextCidr };
          // Recompute DHCP IP when the network changes
          if (updated.dhcpEnabled && nextCidr) {
            updated.ip = computeDhcpIp(nextCidr, nodes, node.id, intf.id);
          }
          return updated;
        }
        return intf;
      });
      return nodeChanged ? { ...node, interfaces } : node;
    });

    if (changed) {
      setNodes(nextNodes);
    }
  }, [nodes, routerNetworks]);

  useEffect(() => {
    const hostTargets = new Map<string, string>();
    nodes
      .filter((node) => node.kind === 'host')
      .forEach((node) => {
        node.interfaces.forEach((intf) => {
          if (intf.targetRouterInterfaceId) {
            hostTargets.set(anchorKey(node.id, intf.id), intf.targetRouterInterfaceId);
          }
        });
      });

    setLinks((current) => {
      let changed = false;
      const nextLinks: NetworkLink[] = [];

      current.forEach((link) => {
        const fromAnchor = anchorKey(link.from.nodeId, link.from.interfaceId);
        const toAnchor = anchorKey(link.to.nodeId, link.to.interfaceId);
        const fromResolved = resolveAnchor(fromAnchor);
        const toResolved = resolveAnchor(toAnchor);

        if (!fromResolved || !toResolved) {
          changed = true;
          return;
        }

        if (fromResolved.node.kind === 'host') {
          const expectedTarget = hostTargets.get(fromAnchor);
          if (!expectedTarget || expectedTarget !== toAnchor) {
            changed = true;
            return;
          }
        }

        if (toResolved.node.kind === 'host') {
          const expectedTarget = hostTargets.get(toAnchor);
          if (!expectedTarget || expectedTarget !== fromAnchor) {
            changed = true;
            return;
          }
        }

        if (fromResolved.node.kind === 'host' && toResolved.node.kind === 'host') {
          changed = true;
          return;
        }

        // For router-to-router links, don't auto-sync CIDRs since each side has its own network
        const isRouterToRouter = fromResolved.node.kind === 'router' && toResolved.node.kind === 'router';
        const routerNetwork = isRouterToRouter ? undefined : (routerNetworks[fromAnchor] ?? routerNetworks[toAnchor]);
        const adjustedLink =
          routerNetwork && routerNetwork !== link.networkCidr ? { ...link, networkCidr: routerNetwork } : link;
        if (adjustedLink !== link) {
          changed = true;
        }
        nextLinks.push(adjustedLink);
      });

      hostTargets.forEach((routerAnchorId, hostAnchorId) => {
        const existing = nextLinks.some(
          (link) =>
            (anchorKey(link.from.nodeId, link.from.interfaceId) === hostAnchorId &&
              anchorKey(link.to.nodeId, link.to.interfaceId) === routerAnchorId) ||
            (anchorKey(link.to.nodeId, link.to.interfaceId) === hostAnchorId &&
              anchorKey(link.from.nodeId, link.from.interfaceId) === routerAnchorId),
        );

        if (existing) return;

        const hostEndpoint = resolveAnchor(hostAnchorId);
        const routerEndpoint = resolveAnchor(routerAnchorId);
        if (!hostEndpoint || !routerEndpoint) return;

        const networkCidr = routerNetworks[routerAnchorId] ?? hostEndpoint.intf.networkCidr ?? '172.27.0.0/24';
        nextLinks.push({
          id: createId(),
          from: { nodeId: hostEndpoint.node.id, interfaceId: hostEndpoint.intf.id },
          to: { nodeId: routerEndpoint.node.id, interfaceId: routerEndpoint.intf.id },
          networkCidr,
        });
        changed = true;
      });

      return changed ? nextLinks : current;
    });
  }, [nodes, routerNetworks]);

  useEffect(() => {
    const nextServiceLinks: ServiceLink[] = [];
    customServices.forEach((service) => {
      const definition = customServicesById[service.definitionId];
      if (!definition || !definition.requiredRoles || definition.requiredRoles.length < 2) return;
      const origin = definition.requiredRoles[0];
      const originHostId = service.roleBindings[origin.role];

      definition.requiredRoles.slice(1).forEach((role) => {
        const targetHostId = service.roleBindings[role.role];
        if (!originHostId || !targetHostId) return;
        const originExists = nodes.some((node) => node.id === originHostId);
        const targetExists = nodes.some((node) => node.id === targetHostId);
        if (!originExists || !targetExists) return;
        nextServiceLinks.push({
          id: `${service.id}-${role.role}`,
          fromHostId: originHostId,
          toHostId: targetHostId,
          customServiceId: service.id,
        });
      });
    });
    setServiceLinks(nextServiceLinks);
  }, [customServices, nodes]);

  useLayoutEffect(() => {
    const container = canvasRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const positions: Record<string, { x: number; y: number }> = {};
    const bounds: Record<string, { x: number; y: number; width: number; height: number; centerX: number; centerY: number }> = {};

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

    Object.entries(nodeRefs.current).forEach(([key, element]) => {
      if (!element) return;
      const box = element.getBoundingClientRect();
      const x = (box.left - rect.left - offset.x) / scale;
      const y = (box.top - rect.top - offset.y) / scale;
      const width = box.width / scale;
      const height = box.height / scale;
      bounds[key] = { x, y, width, height, centerX: x + width / 2, centerY: y + height / 2 };
    });

    setAnchorPositions(positions);
    setNodeBounds(bounds);
  }, [nodes, scale, offset]);

  const nodeEdgePoint = (
    rect: { x: number; y: number; width: number; height: number },
    target: { x: number; y: number },
  ) => {
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    if (dx === 0 && dy === 0) return center;
    const halfW = rect.width / 2;
    const halfH = rect.height / 2;
    const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : Math.abs(halfW / dx);
    const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : Math.abs(halfH / dy);
    const t = Math.min(scaleX, scaleY);
    return { x: center.x + dx * t, y: center.y + dy * t };
  };

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
          <button
            type="button"
            onClick={handleSaveNetwork}
            className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-emerald-400 transition hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200"
          >
            Save
          </button>
          {saveStatus !== 'idle' && (
            <span className="rounded-lg bg-white/10 px-2 py-1 text-xs font-medium text-white ring-1 ring-white/10">
              {saveStatus === 'saving' && 'Saving...'}
              {saveStatus === 'saved' && 'Saved'}
              {saveStatus === 'error' && 'Save failed'}
            </span>
          )}
        {saveError && <span className="text-xs text-red-200">{saveError}</span>}
        <div className="rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-slate-100 ring-1 ring-white/10">
          {game ? `${game.name} network` : 'Network editor'}
        </div>
      </div>

      <div className="pointer-events-auto absolute left-4 top-20 z-20 w-80 space-y-2" onWheel={(event) => event.stopPropagation()}>
        <div className="rounded-lg border border-white/10 bg-slate-900/85 p-3 text-xs shadow-lg backdrop-blur">
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-200">
            <span>Custom services</span>
            <span className="text-[10px] text-slate-400">{customServices.length} active</span>
          </div>
          <div className="space-y-2">
            {customServices.length === 0 && <div className="text-[11px] text-slate-300">None registered</div>}
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {customServices.map((service) => {
                const definition = customServicesById[service.definitionId];
                const issues =
                  service.status === 'complete'
                    ? []
                    : describeCustomServiceIssues(service.definitionId, service.roleBindings);
                return (
                  <div
                    key={service.id}
                    className={`rounded border px-2 py-2 text-[11px] ${
                      service.status === 'complete'
                      ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-50'
                      : 'border-amber-400/40 bg-amber-500/10 text-amber-50'
                  }`}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span>{definition?.name ?? service.definitionId}</span>
                      <div className="flex items-center gap-2">
                        <span className="uppercase tracking-wide">{service.status}</span>
                        <button
                          type="button"
                          onClick={() => removeCustomServiceInstance(service.id)}
                          className="rounded bg-black/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/80 ring-1 ring-white/10 transition hover:bg-rose-500/20 hover:text-white"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {definition?.description && <div className="text-[10px] text-white/80">{definition.description}</div>}
                    {issues.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-[10px] text-amber-50/90">
                        {issues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <ResourceDrawer
        open={drawerOpen}
        onToggle={() => setDrawerOpen((open) => !open)}
        onStartDrag={(_item) => setContextMenu(null)}
        onSelectCustomService={handleCustomServiceSelection}
        activeCustomServiceIds={customServices.map((service) => service.definitionId)}
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
          <button
            type="button"
            onClick={() => setGridSnapEnabled((enabled) => !enabled)}
            className={`pointer-events-auto rounded-lg px-3 py-2 text-sm font-semibold shadow-sm ring-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${gridSnapEnabled ? 'bg-emerald-500 text-white ring-emerald-400 hover:bg-emerald-400 focus-visible:outline-emerald-200' : 'bg-white/10 text-white ring-white/20 hover:bg-white/20 focus-visible:outline-white'}`}
          >
            {gridSnapEnabled ? 'Snap: On' : 'Snap: Off'}
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
                  {serviceLinks.map((link) => {
                    const fromNode = nodes.find((node) => node.id === link.fromHostId);
                    const toNode = nodes.find((node) => node.id === link.toHostId);
                    if (!fromNode || !toNode) return null;
                    const fromBox = nodeBounds[link.fromHostId];
                    const toBox = nodeBounds[link.toHostId];
                    const fallbackStart = { x: fromNode.x + 120, y: fromNode.y + 70 };
                    const fallbackEnd = { x: toNode.x + 120, y: toNode.y + 70 };
                    const fromCenter = fromBox ? { x: fromBox.centerX, y: fromBox.centerY } : fallbackStart;
                    const toCenter = toBox ? { x: toBox.centerX, y: toBox.centerY } : fallbackEnd;
                    const start = fromBox ? surfacePointToward(fromBox, toCenter) : fallbackStart;
                    const end = toBox ? surfacePointToward(toBox, fromCenter) : fallbackEnd;
                    const dx = Math.max(Math.abs(end.x - start.x) * 0.25, 60);
                    const path = `M ${start.x} ${start.y} C ${start.x + dx} ${start.y} ${end.x - dx} ${end.y} ${end.x} ${end.y}`;
                    const customService = customServices.find((service) => service.id === link.customServiceId);
                    const label = customService ? customServicesById[customService.definitionId]?.name ?? 'Service link' : 'Service link';
                    const midX = (start.x + end.x) / 2;
                    const midY = (start.y + end.y) / 2;

                    return (
                      <g key={link.id} className="pointer-events-none">
                        <path
                          d={path}
                          fill="none"
                          stroke="rgba(255, 200, 98, 0.9)"
                          strokeDasharray="10 8"
                          strokeWidth={3}
                          opacity={0.85}
                          className="drop-shadow-lg"
                        />
                        <text
                          x={midX}
                          y={midY - 8}
                          textAnchor="middle"
                          className="fill-amber-100 text-[10px] font-semibold drop-shadow"
                          pointerEvents="none"
                        >
                          {label}
                        </text>
                      </g>
                    );
                  })}
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
                    ref={(element) => {
                      if (element) {
                        nodeRefs.current[node.id] = element;
                      } else {
                        delete nodeRefs.current[node.id];
                      }
                    }}
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
                                  <span className="text-[10px] font-medium text-white/60">
                                    {node.kind === 'router'
                                      ? (intf.targetRouterInterfaceId ? 'uplink' : 'out')
                                      : 'in'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-white/90">
                                  {intf.ip ? (
                                    <>
                                      {intf.ip}
                                      {node.kind === 'host' && intf.dhcpEnabled && (
                                        <span className="ml-1 rounded bg-emerald-500/30 px-1 text-[9px] font-semibold uppercase text-emerald-200">dhcp</span>
                                      )}
                                    </>
                                  ) : (
                                    'No IP assigned'
                                  )}
                                </div>
                                <div className={`text-[10px] ${hasOverlap ? 'text-rose-200' : 'text-slate-200'}`}>
                                  {intf.networkCidr || 'No network'}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {node.services.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1 text-[10px] font-semibold uppercase text-amber-100">
                          {node.services.map((service) => {
                            const definition = serviceDefinitionsById[service.serviceId];
                            return (
                              <span
                                key={service.id}
                                className="rounded bg-amber-500/20 px-2 py-1 text-amber-50 ring-1 ring-amber-400/50"
                              >
                                {definition?.name ?? service.serviceId} • {service.port}/{service.protocol.toUpperCase()}
                              </span>
                            );
                          })}
                        </div>
                      )}
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
          <div
            className="pointer-events-auto absolute right-4 top-20 z-30 w-80 space-y-3 overflow-y-auto rounded-lg border border-white/10 bg-slate-900/85 p-4 text-sm shadow-xl backdrop-blur"
            style={{ maxHeight: '80vh' }}
            onWheel={(event) => event.stopPropagation()}
          >
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
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Name</div>
              <input
                value={selectedNode.label}
                onChange={(event) =>
                  setNodes((current) =>
                    current.map((node) =>
                      node.id === selectedNode.id ? { ...node, label: event.target.value } : node,
                    ),
                  )
                }
                className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white outline-none focus:border-sky-400/60"
              />
            </div>

            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">VM image</div>
              <select
                value={selectedNode.imageId}
                onChange={(event) => {
                  const nextImageId = event.target.value;
                  const replacement = vmImageOptions.find((item) => item.id === nextImageId);
                  if (!replacement) return;
                  setNodes((current) =>
                    current.map((node) =>
                      node.id === selectedNode.id
                        ? {
                            ...node,
                            imageId: nextImageId,
                          }
                        : node,
                    ),
                  );
                }}
                className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-white outline-none focus:border-sky-400/60"
              >
                {vmImageOptions.map((item) => (
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
                              const target = targetId ? resolveAnchor(targetId) : null;
                              updateInterface(selectedNode.id, intf.id, (current) => ({
                                ...current,
                                targetRouterInterfaceId: targetId,
                                networkCidr: target?.intf.networkCidr,
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
                        {selectedNode.kind === 'host' ? (
                          <>
                            <label className="flex items-center justify-between gap-2 rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] uppercase tracking-wide text-slate-200">
                              <span>DHCP</span>
                              <input
                                type="checkbox"
                                checked={Boolean(intf.dhcpEnabled)}
                                onChange={(event) =>
                                  updateInterface(selectedNode.id, intf.id, (current) => ({
                                    ...current,
                                    dhcpEnabled: event.target.checked,
                                  }))
                                }
                                className="h-4 w-4 accent-emerald-400"
                              />
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="text-[11px] uppercase tracking-wide text-slate-400">IP address</span>
                              <input
                                value={intf.ip || ''}
                                placeholder={intf.dhcpEnabled ? 'Assigned via DHCP' : '192.168.0.10'}
                                disabled={Boolean(intf.dhcpEnabled)}
                                onChange={(event) =>
                                  updateInterface(selectedNode.id, intf.id, (current) => ({ ...current, ip: event.target.value }))
                                }
                                className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs outline-none focus:border-sky-400/60 disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-white/5 disabled:text-white/40"
                              />
                              {invalidHost && <span className="text-[11px] text-rose-200">Reserved or duplicate IP</span>}
                            </label>
                            <div className="flex flex-col gap-1">
                              <span className="text-[11px] uppercase tracking-wide text-slate-400">Router network</span>
                              <div className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-100">
                                {intf.networkCidr || 'No router selected'}
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <label className="flex flex-col gap-1">
                              <span className="text-[11px] uppercase tracking-wide text-slate-400">IP address</span>
                              <input
                                value={intf.ip || ''}
                                placeholder="172.27.0.1"
                                onChange={(event) =>
                                  updateInterface(selectedNode.id, intf.id, (current) => ({ ...current, ip: event.target.value }))
                                }
                                className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs outline-none focus:border-sky-400/60"
                              />
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
                            <div className="flex flex-col gap-1">
                              <span className="text-[11px] uppercase tracking-wide text-slate-400">Uplink to router</span>
                              <select
                                value={intf.targetRouterInterfaceId || ''}
                                onChange={(event) => {
                                  const targetId = event.target.value || undefined;
                                  const targetResolved = targetId ? resolveAnchor(targetId) : null;
                                  updateInterface(selectedNode.id, intf.id, (current) => ({
                                    ...current,
                                    targetRouterInterfaceId: targetId,
                                    networkCidr: targetResolved?.intf.networkCidr || current.networkCidr,
                                  }));
                                  // Create a link between this router and the upstream router
                                  if (targetId) {
                                    createLinkBetween(anchorKey(selectedNode.id, intf.id), targetId);
                                  }
                                }}
                                className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-100 outline-none focus:border-sky-400/60"
                              >
                                <option value="" className="bg-slate-900 text-slate-100">
                                  None (standalone)
                                </option>
                                {routerInterfaceOptions
                                  .filter((option) => !option.value.startsWith(selectedNode.id + ':'))
                                  .map((option) => (
                                    <option key={option.value} value={option.value} className="bg-slate-900 text-slate-100">
                                      {option.label}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedNode.kind === 'host' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-400">
                  <span>Services</span>
                  <span className="text-[10px] text-slate-500">Ports configurable per host</span>
                </div>
                <div className="space-y-2">
                  {serviceCatalog.map((service) => {
                    const instance = selectedNode.services.find((item) => item.serviceId === service.id) || null;
                    const assignments = customServices
                      .map((custom) => {
                        const definition = customServicesById[custom.definitionId];
                        const role = definition?.requiredRoles?.find((item) => item.serviceId === service.id);
                        return role ? { custom, role } : null;
                      })
                      .filter(Boolean) as { custom: CustomServiceInstance; role: { role: string; serviceId: string } }[];
                    const inConflict = instance ? servicePortConflicts.has(instance.id) : false;
                    return (
                      <div
                        key={service.id}
                        className={`rounded-lg border px-3 py-2 ${instance ? 'border-emerald-300/40 bg-emerald-500/10' : 'border-white/10 bg-white/5'}`}
                      >
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-100">
                          <div>
                            <div>{service.name}</div>
                            <div className="text-[11px] text-slate-300">{service.description}</div>
                          </div>
                          <label className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-300">
                            <span>{instance ? 'Enabled' : 'Disabled'}</span>
                            <input
                              type="checkbox"
                              checked={Boolean(instance)}
                              onChange={(event) => toggleServiceForNode(selectedNode.id, service.id, event.target.checked)}
                              className="h-4 w-4 accent-emerald-400"
                            />
                          </label>
                        </div>
                        {instance && (
                          <div className="mt-2 space-y-2 text-xs text-slate-200">
                            <label className="flex flex-col gap-1">
                              <span className="text-[11px] uppercase tracking-wide text-slate-400">Port / protocol</span>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  value={instance.port}
                                  onChange={(event) => updateServicePort(selectedNode.id, service.id, Number(event.target.value))}
                                  className={`w-24 rounded border px-2 py-1 text-xs outline-none focus:border-emerald-400/60 ${
                                    inConflict ? 'border-rose-400 bg-rose-500/10 text-rose-100' : 'border-white/10 bg-white/5'
                                  }`}
                                />
                                <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] uppercase tracking-wide text-slate-200">
                                  {instance.protocol.toUpperCase()}
                                </span>
                              </div>
                              {inConflict && <span className="text-[11px] text-rose-200">Port conflict on this host</span>}
                              {!inConflict && service.defaultPort && instance.port !== service.defaultPort && (
                                <span className="text-[11px] text-slate-300">
                                  Default {service.defaultPort}/{service.protocol?.toUpperCase() ?? 'TCP'}
                                </span>
                              )}
                            </label>
                            {assignments.length > 0 && (
                              <div className="space-y-1 rounded border border-white/10 bg-white/5 p-2 text-[11px] text-slate-200">
                                <div className="font-semibold uppercase tracking-wide text-slate-300">Custom service roles</div>
                                {assignments.map(({ custom, role }) => {
                                  const boundHostId = custom.roleBindings[role.role];
                                  const isBoundHere = boundHostId === selectedNode.id;
                                  const boundLabel = isBoundHere ? 'Assigned' : boundHostId ? 'Assigned elsewhere' : 'Unassigned';
                                  return (
                                    <div key={`${custom.id}-${role.role}`} className="flex items-center justify-between gap-2">
                                      <span>{customServicesById[custom.definitionId]?.name ?? custom.definitionId} • {role.role}</span>
                                      <button
                                        type="button"
                                        disabled={Boolean(boundHostId && !isBoundHere)}
                                        onClick={() => attachHostToCustomRole(custom.id, role.role, selectedNode.id)}
                                        className={`rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                                          isBoundHere
                                            ? 'bg-emerald-500/20 text-emerald-50 ring-1 ring-emerald-400/60'
                                            : boundHostId
                                            ? 'cursor-not-allowed bg-white/5 text-slate-400 ring-1 ring-white/10'
                                            : 'bg-amber-500/20 text-amber-50 ring-1 ring-amber-400/60 hover:bg-amber-500/30'
                                        }`}
                                      >
                                        {boundLabel}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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

        {customServiceModal && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
            <div
              className="w-full max-w-xl space-y-4 overflow-y-auto rounded-lg border border-white/10 bg-slate-900/95 p-6 text-sm shadow-2xl"
              style={{ maxHeight: '80vh' }}
              onWheel={(event) => event.stopPropagation()}
            >
              {(() => {
                const definition = customServicesById[customServiceModal];
                if (!definition) {
                  return <div className="text-white">Unknown service</div>;
                }
                return (
                  <>
                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-200">
                      <span>Configure {definition.name}</span>
                      <button
                        type="button"
                        onClick={() => setCustomServiceModal(null)}
                        className="rounded px-2 py-1 text-white/70 transition hover:bg-white/10 hover:text-white"
                      >
                        Close
                      </button>
                    </div>
                    <div className="space-y-2 text-slate-100">
                      <div className="text-base font-semibold">{definition.name}</div>
                      {definition.description && <div className="text-slate-200">{definition.description}</div>}
                      {(definition.dependencies?.length ?? 0) > 0 && (
                        <div className="rounded border border-white/10 bg-white/5 p-2 text-[11px] text-slate-100">
                          <div className="mb-1 font-semibold uppercase tracking-wide text-slate-300">Dependencies</div>
                          <ul className="list-inside list-disc">
                            {definition.dependencies?.map((dependency) => (
                              <li key={dependency}>{serviceDefinitionsById[dependency]?.name ?? dependency}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="rounded border border-white/10 bg-white/5 p-3 text-[11px] text-slate-100">
                        <div className="mb-1 font-semibold uppercase tracking-wide text-slate-300">Required roles</div>
                        <div className="space-y-1">
                          {(definition.requiredRoles ?? []).map((role) => {
                            const serviceDef = serviceDefinitionsById[role.serviceId];
                            return (
                              <div key={role.role} className="flex items-center justify-between rounded bg-black/20 px-2 py-1">
                                <div>
                                  <div className="font-semibold">{role.role}</div>
                                  <div className="text-slate-200">{serviceDef?.name ?? role.serviceId}</div>
                                </div>
                                <div className="text-right text-slate-300">
                                  Default {role.defaultPort ?? serviceDef?.defaultPort ?? 'N/A'} /{' '}
                                  {(serviceDef?.protocol || 'tcp').toUpperCase()}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    {customServiceModalError && <div className="text-[11px] text-rose-200">{customServiceModalError}</div>}
                    <div className="flex flex-wrap justify-end gap-2 text-[11px] font-semibold uppercase tracking-wide">
                      <button
                        type="button"
                        onClick={() => handleAutoCreateCustomService(definition.id)}
                        className="rounded bg-emerald-500/80 px-3 py-2 text-white transition hover:bg-emerald-500"
                      >
                        Auto create & connect
                      </button>
                      <button
                        type="button"
                        onClick={() => handleManualCustomServiceRegistration(definition.id)}
                        className="rounded bg-amber-500/80 px-3 py-2 text-white transition hover:bg-amber-500"
                      >
                        Register manually
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomServiceModal(null)}
                        className="rounded bg-white/10 px-3 py-2 text-white transition hover:bg-white/20"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                );
              })()}
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

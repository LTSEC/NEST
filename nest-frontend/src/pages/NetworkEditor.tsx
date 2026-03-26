import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ResourceDrawer from '../components/ResourceDrawer';
import { getGameById } from '../data/games';
import { networkItemsByCategory } from '../data/networkItems';
import { loadNetworkSnapshot, saveNetworkSnapshot } from '../data/networkStorage';
import { useAuth } from '../providers/AuthProvider';
import { customServiceCatalog, customServicesById, serviceCatalog, serviceDefinitionsById } from '../data/services';
import { fetchPresets } from '../data/presets';
import { presetToSnapshot } from '../data/presetAdapter';

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
  addDefaultUsers?: boolean;
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
  /** Arbitrary key-value pairs consumed by Ansible playbooks (e.g. users, db names). */
  ansibleMeta?: Record<string, string>;
  /** Whether this service is scored by the scoring engine. */
  scored?: boolean;
  /** Points awarded per scoring cycle (1–100). Only meaningful when scored is true. */
  scoringPoints?: number;
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
  const [configModalNodeId, setConfigModalNodeId] = useState<string | null>(null);
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
    const loadData = async () => {
      let snapshot = loadNetworkSnapshot(game?.id ?? null);

      if (!snapshot && game?.presetId) {
        try {
          const presets = await fetchPresets();
          const preset = presets[game.presetId];
          if (preset) {
            snapshot = presetToSnapshot(preset, game.id);
          }
        } catch (e) {
          console.error('Failed to load preset', e);
        }
      }

      if (!snapshot && game?.blackTeamCidr) {
        // Create empty snapshot if starting fresh with black team CIDR
        snapshot = {
          gameId: game.id,
          savedAt: new Date().toISOString(),
          gridSnapEnabled: true,
          nodes: [],
          links: [],
          customServices: [],
        };
      }

      if (!snapshot) return;

      // Strip any competition-router node that may have been persisted by older saves —
      // the comp router is backend infrastructure and must never appear on the canvas.
      snapshot.nodes = snapshot.nodes.filter((n) => n.id !== 'competition-router');
      snapshot.links = snapshot.links.filter(
        (l) => l.from.nodeId !== 'competition-router' && l.to.nodeId !== 'competition-router',
      );

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
          addDefaultUsers: node.addDefaultUsers,
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
    };
    loadData();
  }, [game?.id, game?.presetId, game?.blackTeamCidr]);

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

    // When a router is dropped and a competition network is defined, pre-assign eth0 to that
    // network with the X.X.T.1 IP scheme. The backend substitutes T with the team ID.
    const defaultInterfaces =
      kind === 'router'
        ? [
            game?.blackTeamCidr
              ? (() => {
                  const compOctets = game.blackTeamCidr.split('/')[0].split('.');
                  return {
                    ...createInterface('eth0'),
                    networkCidr: game.blackTeamCidr,
                    ip: compOctets.length === 4 ? `${compOctets[0]}.${compOctets[1]}.T.1` : undefined,
                  };
                })()
              : createInterface('eth0'),
            createInterface('eth1'),
          ]
        : [createInterface('eth0')];

    const newNodeId = createId();
    const newNode: NetworkNode = {
      id: newNodeId,
      kind,
      imageId,
      label,
      x: applyGridSnap(clamp(point.x, 0, MAP_WIDTH)),
      y: applyGridSnap(clamp(point.y, 0, MAP_HEIGHT)),
      interfaces: defaultInterfaces,
      services: [],
    };

    setNodes((current) => [...current, newNode]);
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

    // Auto-connect created VMs to the first available LAN router interface (non-comp-network).
    // This wires the VMs so they appear connected and have a valid networkCidr.
    const lanResult = (() => {
      for (const node of nodes) {
        if (node.kind !== 'router') continue;
        const intf = node.interfaces.find(
          (i) => i.networkCidr && i.networkCidr !== game?.blackTeamCidr,
        );
        if (intf) return { routerNode: node, intf };
      }
      return null;
    })();

    if (lanResult) {
      createdNodes.forEach((hostNode) => {
        const hostIntf = hostNode.interfaces[0];
        hostIntf.networkCidr = lanResult.intf.networkCidr;
        hostIntf.targetRouterInterfaceId = anchorKey(lanResult.routerNode.id, lanResult.intf.id);
      });
    }

    setNodes((current) => [...current, ...createdNodes]);

    if (lanResult) {
      setLinks((current) => [
        ...current,
        ...createdNodes.map((hostNode) => ({
          id: createId(),
          from: { nodeId: hostNode.id, interfaceId: hostNode.interfaces[0].id },
          to: { nodeId: lanResult.routerNode.id, interfaceId: lanResult.intf.id },
          networkCidr: lanResult.intf.networkCidr!,
        })),
      ]);
    }

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
          addDefaultUsers: node.addDefaultUsers,
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
                  const isCompNetwork =
                    Boolean(game?.blackTeamCidr) && updated.networkCidr === game?.blackTeamCidr;
                  if (isCompNetwork) {
                    // Set the IP to the X.X.T.1 scheme so the backend can substitute T with team ID.
                    const compOctets = game!.blackTeamCidr!.split('/')[0].split('.');
                    if (compOctets.length === 4) {
                      updated.ip = `${compOctets[0]}.${compOctets[1]}.T.1`;
                    }
                  } else if (!updated.ip) {
                    // Only auto-assign .1 when the field is currently blank (never overwrite user edits).
                    const cidrIp = updated.networkCidr?.split('/')[0];
                    const octets = cidrIp?.split('.');
                    if (octets && octets.length === 4) {
                      octets[3] = '1';
                      updated.ip = octets.join('.');
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
          node.interfaces
            .filter((intf) => !(game?.blackTeamCidr && intf.networkCidr === game.blackTeamCidr))
            .map((intf) => ({
              value: anchorKey(node.id, intf.id),
              label: `${node.label} • ${intf.name}`,
            })),
        ),
    [nodes, game?.blackTeamCidr],
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

  const isCompNetworkInterface = (node: NetworkNode, intf: NetworkInterface) =>
    node.kind === 'router' && Boolean(game?.blackTeamCidr) && intf.networkCidr === game?.blackTeamCidr;

  const createLinkBetween = (sourceAnchorId: string, targetAnchorId: string) => {
    const source = resolveAnchor(sourceAnchorId);
    const target = resolveAnchor(targetAnchorId);
    if (!source || !target) return;
    if (source.node.id === target.node.id) return;
    if (source.node.kind === 'host' && target.node.kind === 'host') return;

    // Block connections on interfaces locked to the competition network
    if (isCompNetworkInterface(source.node, source.intf)) return;
    if (isCompNetworkInterface(target.node, target.intf)) return;

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
    // Router-to-Router: only propagate CIDR to the specific linked interface that lacks one.
    // Never touch other interfaces on either router to prevent network bleed.
    if (routerEndpoints.length === 2) {
      const [epA, epB] = routerEndpoints;
      if (epA.intf.networkCidr && !epB.intf.networkCidr) {
        updateInterface(epB.node.id, epB.intf.id, (intf) => ({ ...intf, networkCidr: epA.intf.networkCidr }));
        newLink.networkCidr = epA.intf.networkCidr!;
      } else if (epB.intf.networkCidr && !epA.intf.networkCidr) {
        updateInterface(epA.node.id, epA.intf.id, (intf) => ({ ...intf, networkCidr: epB.intf.networkCidr }));
        newLink.networkCidr = epB.intf.networkCidr!;
      }
      // If both or neither have a CIDR, leave as-is.
    } else {
      // Single router (Router <-> Host) logic remains
      routerEndpoints.forEach((endpoint) => {
        if (!endpoint.intf.networkCidr) {
          updateInterface(endpoint.node.id, endpoint.intf.id, (intf) => ({ ...intf, networkCidr: newLink.networkCidr }));
        }
      });
    }

    if (hostEndpoint) {
      updateInterface(hostEndpoint.node.id, hostEndpoint.intf.id, (intf) => ({
        ...intf,
        networkCidr: newLink.networkCidr,
        targetRouterInterfaceId: primaryRouter
          ? anchorKey(primaryRouter.node.id, primaryRouter.intf.id)
          : intf.targetRouterInterfaceId,
      }));
    }
    setSelectedLinkId(newLink.id);
    setSelectedNodeId(null);
  };

  const handleAnchorMouseDown = (event: React.MouseEvent<HTMLDivElement>, anchorId: string) => {
    event.stopPropagation();
    // Block drag-to-link from comp-network interfaces
    const resolved = resolveAnchor(anchorId);
    if (resolved && isCompNetworkInterface(resolved.node, resolved.intf)) return;
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
        const ansibleMeta: Record<string, string> = {};
        for (const field of definition.ansibleFields ?? []) {
          if (field.defaultValue !== undefined) ansibleMeta[field.key] = field.defaultValue;
        }
        return [
          ...services,
          {
            id: createId(),
            serviceId: definitionId,
            protocol: definition.protocol === 'udp' ? 'udp' : 'tcp',
            port: defaultPort,
            customServiceId,
            ansibleMeta,
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

  const updateServiceAnsibleMeta = (nodeId: string, definitionId: string, key: string, value: string) => {
    updateNodeServices(nodeId, (services) =>
      services.map((service) => {
        if (service.serviceId !== definitionId) return service;
        const meta = { ...(service.ansibleMeta ?? {}), [key]: value };
        return { ...service, ansibleMeta: meta };
      }),
    );
  };

  const hasScoringEngine = Boolean(game?.rvbServices?.includes('Scoring Engine'));

  const toggleServiceScored = (nodeId: string, definitionId: string, scored: boolean) => {
    updateNodeServices(nodeId, (services) =>
      services.map((service) =>
        service.serviceId === definitionId
          ? { ...service, scored, scoringPoints: scored ? (service.scoringPoints ?? 10) : undefined }
          : service,
      ),
    );
  };

  const updateServiceScoringPoints = (nodeId: string, definitionId: string, points: number) => {
    const clamped = Number.isNaN(points) ? 1 : Math.min(100, Math.max(1, points));
    updateNodeServices(nodeId, (services) =>
      services.map((service) =>
        service.serviceId === definitionId ? { ...service, scoringPoints: clamped } : service,
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
    <div className="h-screen w-screen bg-[#0a0f1e] text-white">
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
            className="rounded-xl bg-white/10 px-3.5 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur-sm transition-all hover:bg-white/20"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={handleSaveNetwork}
            className="rounded-xl bg-emerald-500 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-400 hover:shadow-md hover:shadow-emerald-500/25"
          >
            Save
          </button>
          {saveStatus !== 'idle' && (
            <span className={`rounded-lg px-2.5 py-1 text-xs font-medium backdrop-blur-sm ${
              saveStatus === 'saved' ? 'bg-emerald-500/20 text-emerald-200' :
              saveStatus === 'error' ? 'bg-red-500/20 text-red-200' :
              'bg-white/10 text-white'
            }`}>
              {saveStatus === 'saving' && 'Saving...'}
              {saveStatus === 'saved' && 'Saved'}
              {saveStatus === 'error' && 'Save failed'}
            </span>
          )}
        {saveError && <span className="text-xs text-red-300">{saveError}</span>}
        <div className="rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 backdrop-blur-sm">
          {game ? `${game.name} network` : 'Network editor'}
        </div>
      </div>

      <div className="pointer-events-auto absolute left-4 top-20 z-20 w-80 space-y-2" onWheel={(event) => event.stopPropagation()}>
        <div className="rounded-2xl border border-white/10 bg-slate-900/90 p-4 text-xs shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-slate-300">
            <span>Custom services</span>
            <span className="text-[10px] text-slate-500">{customServices.length} active</span>
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
                          className="rounded border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/80 transition hover:border-rose-400/30 hover:bg-rose-500/20 hover:text-white"
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

      <div className="pointer-events-none absolute right-4 top-4 z-20 flex items-center gap-1.5">
          <button
            type="button"
            onClick={zoomOut}
            className="pointer-events-auto rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20"
          >
            -
          </button>
          <button
            type="button"
            onClick={zoomIn}
            className="pointer-events-auto rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20"
          >
            +
          </button>
          <button
            type="button"
            onClick={resetView}
            className="pointer-events-auto rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => setGridSnapEnabled((enabled) => !enabled)}
            className={`pointer-events-auto rounded-xl px-3 py-2 text-sm font-semibold shadow-sm transition-all ${gridSnapEnabled ? 'bg-emerald-500 text-white hover:bg-emerald-400' : 'bg-white/10 text-white backdrop-blur-sm hover:bg-white/20'}`}
          >
            {gridSnapEnabled ? 'Snap: On' : 'Snap: Off'}
          </button>
          <span className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium text-slate-200 backdrop-blur-sm">{Math.round(scale * 100)}%</span>
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
                      className={`pointer-events-auto w-60 select-none rounded-xl border px-3 py-2 text-sm font-semibold shadow-lg shadow-black/30 backdrop-blur transition ${node.kind === 'router' ? 'border-sky-400/30 bg-sky-500/20 text-sky-100' : 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100'} ${selectedNodeId === node.id ? 'border-white/50 shadow-white/10' : ''}`}
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
                          const isCompLocked = node.kind === 'router' && Boolean(game?.blackTeamCidr) && intf.networkCidr === game?.blackTeamCidr;
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
                                className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 ${anchorSide === 'left' ? '-left-4' : '-right-4'} ${isCompLocked ? 'border-sky-300 bg-sky-500 cursor-not-allowed' : hasOverlap ? 'border-rose-300 bg-rose-500' : 'border-white/70 bg-white/80'}`}
                                onMouseDown={(event) => handleAnchorMouseDown(event, key)}
                                onMouseUp={(event) => handleAnchorMouseUp(event, key)}
                                title={isCompLocked ? 'Locked to competition network' : hasOverlap ? 'Overlapping network range' : 'Drag to link'}
                              />
                              <div className={`flex-1 rounded-lg border px-2 py-1 ${isCompLocked ? 'border-sky-400/30 bg-sky-500/10' : 'border-white/10 bg-white/5'}`}>
                                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-white/80">
                                  <span>{intf.name}</span>
                                  {isCompLocked ? (
                                    <span className="rounded bg-sky-500/30 px-1 text-[9px] font-bold uppercase tracking-wide text-sky-100">
                                      comp
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-medium text-white/60">
                                      {node.kind === 'router'
                                        ? (intf.targetRouterInterfaceId ? 'uplink' : 'out')
                                        : 'in'}
                                    </span>
                                  )}
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
                                className="rounded border border-amber-400/40 bg-amber-500/20 px-2 py-1 text-amber-50"
                              >
                                {definition?.name ?? service.serviceId} • {service.port}/{service.protocol.toUpperCase()}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {node.kind === 'host' && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setConfigModalNodeId(node.id);
                          }}
                          className="mt-2 w-full rounded-lg border border-indigo-400/30 bg-indigo-500/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-100 transition hover:border-indigo-400/50 hover:bg-indigo-500/50 hover:text-white"
                        >
                          Configure
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-xl border border-white/10 bg-black/40 px-6 py-4 text-center text-sm font-medium text-slate-100">
                Drag resources from the drawer onto the canvas. Pan with left click, scroll to zoom, and right click a node to duplicate or delete it.
              </div>
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute bottom-4 right-4 z-30 rounded-2xl border border-white/10 bg-slate-900/90 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-300">
            <span>Overview</span>
            <span className="text-[11px] text-slate-500">{nodes.length} nodes</span>
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
            className="pointer-events-auto absolute right-4 top-20 z-30 w-80 space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/90 p-4 text-sm shadow-2xl shadow-black/40 backdrop-blur-xl"
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

            <label className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200">
              <input
                type="checkbox"
                checked={Boolean(selectedNode.addDefaultUsers)}
                onChange={(event) =>
                  setNodes((current) =>
                    current.map((node) =>
                      node.id === selectedNode.id ? { ...node, addDefaultUsers: event.target.checked } : node,
                    ),
                  )
                }
                className="h-4 w-4 accent-emerald-400"
              />
              <span className="uppercase tracking-wide">Add default users</span>
            </label>

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

                  // Check if this interface is an uplink to a router (and thus inherits CIDR)
                  const isUplink = links.some(
                    (l) =>
                      ((l.from.nodeId === selectedNode.id && l.from.interfaceId === intf.id) ||
                       (l.to.nodeId === selectedNode.id && l.to.interfaceId === intf.id)) &&
                      // Find the other node
                      nodes.find(n => n.id === (l.from.nodeId === selectedNode.id ? l.to.nodeId : l.from.nodeId))?.kind === 'router'
                  );

                  // Detect if this interface is locked to the competition network (backend assigns the IP)
                  const isCompNetworkIntf =
                    selectedNode.kind === 'router' &&
                    Boolean(game?.blackTeamCidr) &&
                    intf.networkCidr === game?.blackTeamCidr;

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
                            {game?.blackTeamCidr && intf.networkCidr !== game.blackTeamCidr && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateInterface(selectedNode.id, intf.id, (current) => ({
                                    ...current,
                                    networkCidr: game.blackTeamCidr,
                                    dhcpEnabled: false,
                                    targetRouterInterfaceId: undefined,
                                  }))
                                }
                                className="rounded border border-sky-400/40 bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-200 transition hover:bg-sky-500/20"
                              >
                                Connect to Comp Network ({game.blackTeamCidr})
                              </button>
                            )}
                          </>
                        ) : isCompNetworkIntf ? (
                          // Comp-network interface: locked — no connections allowed, IP uses T scheme
                          <>
                            <div className="flex flex-col gap-1">
                              <span className="text-[11px] uppercase tracking-wide text-slate-400">Network (CIDR)</span>
                              <div className="flex items-center gap-1 rounded border border-sky-400/40 bg-sky-500/10 px-2 py-1 text-xs text-sky-200">
                                <span className="font-semibold">{intf.networkCidr}</span>
                                <span className="ml-auto rounded bg-sky-500/30 px-1 text-[9px] font-bold uppercase tracking-wide text-sky-100">
                                  Comp Network
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-[11px] uppercase tracking-wide text-slate-400">IP address</span>
                              <div className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold text-sky-200">
                                {intf.ip || `${game!.blackTeamCidr!.split('/')[0].split('.').slice(0, 2).join('.')}.T.1`}
                              </div>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                T is replaced with each team's ID at deploy time.
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                // Remove any links on this interface before disconnecting
                                setLinks((current) =>
                                  current.filter(
                                    (l) =>
                                      !(l.from.nodeId === selectedNode.id && l.from.interfaceId === intf.id) &&
                                      !(l.to.nodeId === selectedNode.id && l.to.interfaceId === intf.id),
                                  ),
                                );
                                updateInterface(selectedNode.id, intf.id, (current) => ({
                                  ...current,
                                  networkCidr: undefined,
                                  ip: undefined,
                                }));
                              }}
                              className="rounded border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-200 transition hover:bg-rose-500/20"
                            >
                              Disconnect from Comp Network
                            </button>
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
                                disabled={isUplink}
                                onChange={(event) =>
                                  updateInterface(selectedNode.id, intf.id, (current) => ({
                                    ...current,
                                    networkCidr: event.target.value,
                                  }))
                                }
                                className={`rounded border px-2 py-1 text-xs outline-none focus:border-sky-400/60 ${overlapping ? 'border-rose-400 bg-rose-500/10 text-rose-50' : 'border-white/10 bg-white/5 text-white'} ${isUplink ? 'cursor-not-allowed opacity-60' : ''}`}
                              />
                              {isUplink && <span className="text-[10px] text-slate-400">Inherited from uplink</span>}
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
                            {game?.blackTeamCidr && intf.networkCidr !== game.blackTeamCidr && (
                              <button
                                type="button"
                                onClick={() => {
                                  // Remove any existing links on this interface before connecting to comp
                                  setLinks((current) =>
                                    current.filter(
                                      (l) =>
                                        !(l.from.nodeId === selectedNode.id && l.from.interfaceId === intf.id) &&
                                        !(l.to.nodeId === selectedNode.id && l.to.interfaceId === intf.id),
                                    ),
                                  );
                                  updateInterface(selectedNode.id, intf.id, (current) => ({
                                    ...current,
                                    networkCidr: game.blackTeamCidr,
                                    targetRouterInterfaceId: undefined,
                                  }));
                                }}
                                className="rounded border border-sky-400/40 bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-200 transition hover:bg-sky-500/20"
                              >
                                Connect to Comp Network ({game.blackTeamCidr})
                              </button>
                            )}
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
                <div className="text-[11px] uppercase tracking-wide text-slate-400">
                  Services — {selectedNode.services.length} active
                </div>
                {selectedNode.services.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedNode.services.map((svc) => {
                      const def = serviceDefinitionsById[svc.serviceId];
                      return (
                        <span key={svc.id} className="rounded border border-amber-400/40 bg-amber-500/20 px-2 py-1 text-[10px] font-semibold uppercase text-amber-50">
                          {def?.name ?? svc.serviceId} • {svc.port}
                        </span>
                      );
                    })}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setConfigModalNodeId(selectedNode.id)}
                  className="w-full rounded-lg border border-indigo-400/30 bg-indigo-500/30 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-100 transition hover:border-indigo-400/50 hover:bg-indigo-500/50 hover:text-white"
                >
                  Open service configuration
                </button>
              </div>
            )}

            {selectedNode.kind === 'router' && String(selectedNode.imageId) === '1' && (
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Services</div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-100">
                    <span>ICMP Ping</span>
                    <label className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-300">
                      <span>{selectedNode.services.some((s) => s.serviceId === 'icmp-ping') ? 'Enabled' : 'Disabled'}</span>
                      <input
                        type="checkbox"
                        checked={selectedNode.services.some((s) => s.serviceId === 'icmp-ping')}
                        onChange={(event) => toggleServiceForNode(selectedNode.id, 'icmp-ping', event.target.checked)}
                        className="h-4 w-4 accent-emerald-400"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {selectedLink && (
          <div className="pointer-events-auto absolute right-4 top-[calc(20px+360px)] z-30 w-80 space-y-3 rounded-2xl border border-white/10 bg-slate-900/90 p-4 text-sm shadow-2xl shadow-black/40 backdrop-blur-xl">
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
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div
              className="w-full max-w-xl animate-slide-up space-y-4 overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/95 p-6 text-sm shadow-2xl shadow-black/50"
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

        {configModalNodeId && (() => {
          const configNode = nodes.find((n) => n.id === configModalNodeId);
          if (!configNode || configNode.kind !== 'host') return null;
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
              onClick={(event) => { if (event.target === event.currentTarget) setConfigModalNodeId(null); }}
              onWheel={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div
                className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl shadow-black/40 animate-slide-up"
                onWheel={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Host configuration</div>
                    <div className="text-lg font-bold text-white">{configNode.label}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfigModalNodeId(null)}
                    className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
                  >
                    Close
                  </button>
                </div>
                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                  <label className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200">
                    <input
                      type="checkbox"
                      checked={Boolean(configNode.addDefaultUsers)}
                      onChange={(event) =>
                        setNodes((current) =>
                          current.map((node) =>
                            node.id === configNode.id ? { ...node, addDefaultUsers: event.target.checked } : node,
                          ),
                        )
                      }
                      className="h-4 w-4 accent-emerald-400"
                    />
                    <span className="uppercase tracking-wide">Add default users</span>
                  </label>

                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Services — toggle and configure Ansible parameters
                  </div>
                  {serviceCatalog.map((service) => {
                    const instance = configNode.services.find((item) => item.serviceId === service.id) || null;
                    const inConflict = instance ? servicePortConflicts.has(instance.id) : false;
                    const assignments = customServices
                      .map((custom) => {
                        const definition = customServicesById[custom.definitionId];
                        const role = definition?.requiredRoles?.find((item) => item.serviceId === service.id);
                        return role ? { custom, role } : null;
                      })
                      .filter(Boolean) as { custom: CustomServiceInstance; role: { role: string; serviceId: string } }[];
                    return (
                      <div
                        key={service.id}
                        className={`rounded-lg border px-4 py-3 ${instance ? 'border-emerald-300/40 bg-emerald-500/10' : 'border-white/10 bg-white/5'}`}
                      >
                        <div className="flex items-center justify-between text-sm font-semibold text-slate-100">
                          <div>
                            <div>{service.name}</div>
                            <div className="text-[11px] font-normal text-slate-300">{service.description}</div>
                          </div>
                          <label className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-300">
                            <span>{instance ? 'Enabled' : 'Disabled'}</span>
                            <input
                              type="checkbox"
                              checked={Boolean(instance)}
                              onChange={(event) => toggleServiceForNode(configNode.id, service.id, event.target.checked)}
                              className="h-4 w-4 accent-emerald-400"
                            />
                          </label>
                        </div>
                        {instance && (
                          <div className="mt-3 space-y-3 border-t border-white/10 pt-3 text-xs text-slate-200">
                            <div className="flex items-center gap-4">
                              <label className="flex flex-col gap-1">
                                <span className="text-[11px] uppercase tracking-wide text-slate-400">Port</span>
                                <input
                                  type="number"
                                  value={instance.port}
                                  onChange={(event) => updateServicePort(configNode.id, service.id, Number(event.target.value))}
                                  className={`w-24 rounded border px-2 py-1 text-xs outline-none focus:border-emerald-400/60 ${
                                    inConflict ? 'border-rose-400 bg-rose-500/10 text-rose-100' : 'border-white/10 bg-white/5'
                                  }`}
                                />
                                {inConflict && <span className="text-[11px] text-rose-200">Port conflict</span>}
                              </label>
                              <div className="flex flex-col gap-1">
                                <span className="text-[11px] uppercase tracking-wide text-slate-400">Protocol</span>
                                <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] uppercase tracking-wide text-slate-200">
                                  {instance.protocol.toUpperCase()}
                                </span>
                              </div>
                            </div>
                            {hasScoringEngine && (
                              <div className="flex items-center gap-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2">
                                <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-amber-100">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(instance.scored)}
                                    onChange={(event) => toggleServiceScored(configNode.id, service.id, event.target.checked)}
                                    className="h-4 w-4 accent-amber-400"
                                  />
                                  Scored
                                </label>
                                {instance.scored && (
                                  <label className="flex items-center gap-2 text-[11px] text-amber-100">
                                    <span className="uppercase tracking-wide text-amber-200">Points / cycle</span>
                                    <input
                                      type="number"
                                      min={1}
                                      max={100}
                                      value={instance.scoringPoints ?? 10}
                                      onChange={(event) => updateServiceScoringPoints(configNode.id, service.id, Number(event.target.value))}
                                      className="w-16 rounded border border-amber-400/40 bg-amber-500/20 px-2 py-1 text-xs text-white outline-none focus:border-amber-300"
                                    />
                                  </label>
                                )}
                              </div>
                            )}
                            {(service.ansibleFields ?? []).length > 0 && (
                              <div className="space-y-2 rounded-lg border border-indigo-400/30 bg-indigo-500/10 p-3">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-200">
                                  Ansible configuration
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  {(service.ansibleFields ?? []).map((field) => (
                                    <label key={field.key} className="flex flex-col gap-1">
                                      <span className="text-[11px] uppercase tracking-wide text-slate-300">{field.label}</span>
                                      <input
                                        value={instance.ansibleMeta?.[field.key] ?? field.defaultValue ?? ''}
                                        placeholder={field.placeholder}
                                        onChange={(event) =>
                                          updateServiceAnsibleMeta(configNode.id, service.id, field.key, event.target.value)
                                        }
                                        className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white outline-none focus:border-indigo-400/60"
                                      />
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                            {assignments.length > 0 && (
                              <div className="space-y-1 rounded border border-white/10 bg-white/5 p-2 text-[11px] text-slate-200">
                                <div className="font-semibold uppercase tracking-wide text-slate-300">Custom service roles</div>
                                {assignments.map(({ custom, role }) => {
                                  const boundHostId = custom.roleBindings[role.role];
                                  const isBoundHere = boundHostId === configNode.id;
                                  const boundLabel = isBoundHere ? 'Assigned' : boundHostId ? 'Assigned elsewhere' : 'Unassigned';
                                  return (
                                    <div key={`${custom.id}-${role.role}`} className="flex items-center justify-between gap-2">
                                      <span>{customServicesById[custom.definitionId]?.name ?? custom.definitionId} - {role.role}</span>
                                      <button
                                        type="button"
                                        disabled={Boolean(boundHostId && !isBoundHere)}
                                        onClick={() => attachHostToCustomRole(custom.id, role.role, configNode.id)}
                                        className={`rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                                          isBoundHere
                                            ? 'border border-emerald-400/50 bg-emerald-500/20 text-emerald-50'
                                            : boundHostId
                                            ? 'cursor-not-allowed border border-white/10 bg-white/5 text-slate-400'
                                            : 'border border-amber-400/50 bg-amber-500/20 text-amber-50 hover:bg-amber-500/30'
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
            </div>
          );
        })()}

        {contextMenu && (
          <div
            className="absolute z-40 w-36 rounded-xl border border-white/10 bg-slate-900/95 py-1.5 text-sm shadow-2xl shadow-black/40 backdrop-blur-xl"
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

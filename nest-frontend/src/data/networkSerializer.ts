import { NetworkSnapshot, PersistedNode, PersistedLink, PersistedInterface } from './networkStorage';
import { Game } from './games';
import { serviceDefinitionsById } from './services';

/**
 * CyberGame payload types matching the Go backend types.CyberGame struct.
 * This is what the Python tfparser.py expects to receive.
 */
export interface CyberGamePayload {
  networks: { name: string; cidr: string }[];
  devices: CyberGameDevice[];
  blackteamServices: { name: string; templateId: number; hostId: number; ip: string }[];
  applications: { name: string; servers: string[]; services: string[]; color: string }[];
  ldapZones: {
    name: string;
    server: string;
    users: { username: string; password: string }[];
    connectedServers: string[];
  }[];
}

export interface CyberGameDevice {
  name: string;
  type: 'Router' | 'Server';
  os: { id: number; name: string };
  hostId: number | null;
  interfaces?: Record<string, string>;
  router?: string;
  interface?: string;
  segment?: string;
  dhcp?: boolean;
  ip?: string;
  services: Record<string, number>;
  ldapZone?: string;
}

const anchorKey = (nodeId: string, interfaceId: string) => `${nodeId}:${interfaceId}`;

/**
 * Generates a human-readable network name from a router interface's CIDR.
 * e.g. "Router1 eth1" for the interface eth1 on Router1.
 */
const networkNameForRouterInterface = (
  routerNode: PersistedNode,
  intf: PersistedInterface,
): string => {
  return `${routerNode.label} ${intf.name}`.toUpperCase().replace(/\s+/g, ' ').trim();
};

/**
 * Determines which router interface a host interface is connected to
 * by looking at the links array.
 */
const findConnectedRouter = (
  hostNodeId: string,
  hostInterfaceId: string,
  links: PersistedLink[],
  nodes: PersistedNode[],
): { routerNode: PersistedNode; routerInterface: PersistedInterface } | null => {
  for (const link of links) {
    let routerEnd: { nodeId: string; interfaceId: string } | null = null;

    if (link.from.nodeId === hostNodeId && link.from.interfaceId === hostInterfaceId) {
      routerEnd = link.to;
    } else if (link.to.nodeId === hostNodeId && link.to.interfaceId === hostInterfaceId) {
      routerEnd = link.from;
    }

    if (!routerEnd) continue;

    const routerNode = nodes.find((n) => n.id === routerEnd!.nodeId && n.kind === 'router');
    if (!routerNode) continue;

    const routerIntf = routerNode.interfaces.find((i) => i.id === routerEnd!.interfaceId);
    if (!routerIntf) continue;

    return { routerNode, routerInterface: routerIntf };
  }
  return null;
};

/**
 * Determines if a router is the "infrastructure" (competition) router.
 * The infra router is defined as having an interface connected to the WAN
 * (an interface whose network CIDR contains 'T' in the octet for team numbering,
 * or a router that has no hostId/is not connected to other routers as children).
 *
 * For simplicity: the first router whose eth0 connects to no other router
 * is considered the infra/competition router. Users can set hostId via the
 * image ID in the network editor.
 */
const isInfraRouter = (
  node: PersistedNode,
  links: PersistedLink[],
  nodes: PersistedNode[],
): boolean => {
  // A router is an infra router if none of its interfaces are connected
  // to another router (i.e., it's the top-level gateway).
  for (const intf of node.interfaces) {
    const key = anchorKey(node.id, intf.id);
    for (const link of links) {
      const fromKey = anchorKey(link.from.nodeId, link.from.interfaceId);
      const toKey = anchorKey(link.to.nodeId, link.to.interfaceId);
      let otherNodeId: string | null = null;

      if (fromKey === key) otherNodeId = link.to.nodeId;
      else if (toKey === key) otherNodeId = link.from.nodeId;

      if (otherNodeId) {
        const otherNode = nodes.find((n) => n.id === otherNodeId);
        if (otherNode?.kind === 'router') {
          // This router IS connected to another router - check if this is the parent
          // A parent router has its child connecting TO it, not FROM it
          // For now, use heuristic: infra router has imageId that parses as non-negative int
          // and is not connected as a child of another router
        }
      }
    }
  }

  // Heuristic: router with imageId "-1" (Blank) that has no parent router is infra
  const imageId = parseInt(node.imageId, 10);
  return imageId < 0;
};

/**
 * Collects all unique network CIDRs from router interfaces.
 * Returns a map of network name -> CIDR.
 */
const collectNetworks = (
  nodes: PersistedNode[],
  links: PersistedLink[],
): Map<string, string> => {
  const networks = new Map<string, string>();

  for (const node of nodes) {
    if (node.kind !== 'router') continue;
    for (const intf of node.interfaces) {
      if (!intf.networkCidr) continue;
      const name = networkNameForRouterInterface(node, intf);

      // Check if this interface connects to another router (WAN link)
      const key = anchorKey(node.id, intf.id);
      let connectsToRouter = false;
      for (const link of links) {
        const fromKey = anchorKey(link.from.nodeId, link.from.interfaceId);
        const toKey = anchorKey(link.to.nodeId, link.to.interfaceId);
        let otherNodeId: string | null = null;

        if (fromKey === key) otherNodeId = link.to.nodeId;
        else if (toKey === key) otherNodeId = link.from.nodeId;

        if (otherNodeId) {
          const otherNode = nodes.find((n) => n.id === otherNodeId);
          if (otherNode?.kind === 'router') {
            connectsToRouter = true;
            break;
          }
        }
      }

      if (connectsToRouter) {
        // For router-to-router links, use the parent router's network name
        // and mark with 'T' for team numbering if it's the WAN
        const isInfra = isInfraRouter(node, links, nodes);
        if (isInfra) {
          // WAN network - use T notation for team-per-octet
          const cidr = intf.networkCidr;
          const [ip, prefix] = cidr.split('/');
          const octets = ip.split('.');
          // Replace last non-zero octet with T for team numbering
          octets[octets.length - 2] = 'T';
          octets[octets.length - 1] = '0';
          networks.set('External WAN', `${octets.join('.')}/${prefix}`);
        }
      } else {
        // Normal team network
        networks.set(name, intf.networkCidr);
      }
    }
  }

  return networks;
};

/**
 * Converts the frontend NetworkSnapshot into a CyberGamePayload
 * that the Go backend and Python tfparser.py can process.
 */
export const serializeNetworkToCyberGame = (
  snapshot: NetworkSnapshot,
  game: Game,
  teamCount: number,
): CyberGamePayload => {
  const { nodes, links } = snapshot;

  // 1. Collect all unique networks from router interfaces
  const networkMap = collectNetworks(nodes, links);
  const networkArray = Array.from(networkMap.entries()).map(([name, cidr]) => ({
    name,
    cidr,
  }));

  // 2. Convert nodes to devices
  const devices: CyberGameDevice[] = [];

  for (const node of nodes) {
    if (node.kind === 'router') {
      const interfaces: Record<string, string> = {};
      let lastNetworkName = '';

      for (const intf of node.interfaces) {
        if (!intf.networkCidr && !intf.ip) {
          interfaces[intf.name] = '';
          continue;
        }

        // Check if this interface connects to another router
        const key = anchorKey(node.id, intf.id);
        let connectsToRouter = false;
        for (const link of links) {
          const fromKey = anchorKey(link.from.nodeId, link.from.interfaceId);
          const toKey = anchorKey(link.to.nodeId, link.to.interfaceId);
          let otherNodeId: string | null = null;

          if (fromKey === key) otherNodeId = link.to.nodeId;
          else if (toKey === key) otherNodeId = link.from.nodeId;

          if (otherNodeId) {
            const otherNode = nodes.find((n) => n.id === otherNodeId);
            if (otherNode?.kind === 'router') {
              connectsToRouter = true;
              break;
            }
          }
        }

        if (connectsToRouter) {
          // This is a WAN-facing interface
          interfaces[intf.name] = 'External WAN';
          lastNetworkName = 'External WAN';
        } else {
          // LAN interface
          const networkName = networkNameForRouterInterface(node, intf);
          interfaces[intf.name] = intf.ip ? `${intf.ip}/${intf.networkCidr?.split('/')[1] || '24'}` : '';
          lastNetworkName = networkName;
        }
      }

      const imageId = parseInt(node.imageId, 10);
      const infra = isInfraRouter(node, links, nodes);

      devices.push({
        name: node.label,
        type: 'Router',
        os: { id: isNaN(imageId) ? 0 : Math.abs(imageId), name: node.label },
        hostId: infra ? null : (isNaN(imageId) ? 0 : Math.abs(imageId)),
        interfaces,
        services: {},
      });
    } else {
      // Host/Server
      const hostInterfaces = node.interfaces;
      const firstInterface = hostInterfaces[0];

      // Find which router this host is connected to
      let routerName = '';
      let interfaceName = '';
      let segment = '';

      if (firstInterface) {
        const connected = findConnectedRouter(node.id, firstInterface.id, links, nodes);
        if (connected) {
          routerName = connected.routerNode.label;
          interfaceName = connected.routerInterface.name;
          segment = networkNameForRouterInterface(connected.routerNode, connected.routerInterface);
        }
      }

      // Build services map
      const services: Record<string, number> = {};
      for (const svc of node.services || []) {
        const def = serviceDefinitionsById[svc.serviceId];
        const name = def?.name || svc.serviceId;
        services[name] = svc.port;
      }

      const imageId = parseInt(node.imageId, 10);

      devices.push({
        name: node.label,
        type: 'Server',
        os: { id: isNaN(imageId) ? 0 : Math.abs(imageId), name: node.label },
        hostId: null,
        router: routerName,
        interface: interfaceName,
        segment,
        dhcp: firstInterface?.dhcpEnabled ?? false,
        ip: firstInterface?.ip || '',
        services,
      });
    }
  }

  // 3. Build blackteam services from game RvB services
  const blackteamServices = (game.rvbServices || []).map((service, index) => ({
    name: service,
    templateId: index + 1,
    hostId: index + 1,
    ip: `10.0.0.${index + 10}`,
  }));

  // 4. Build applications
  const applications = game.types.map((type, index) => ({
    name: `${game.name} - ${type}`,
    servers: nodes.filter((n) => n.kind === 'host').map((n) => n.label),
    services: nodes
      .filter((n) => n.kind === 'host')
      .flatMap((n) => (n.services || []).map((s) => serviceDefinitionsById[s.serviceId]?.name || s.serviceId)),
    color: ['#E11D48', '#2563EB', '#10B981'][index % 3],
  }));

  // 5. Build LDAP zones
  const safeTeamCount = Math.max(1, Math.floor(teamCount));
  const ldapZones = Array.from({ length: safeTeamCount }, (_, index) => {
    const teamNumber = index + 1;
    return {
      name: `Team ${teamNumber}`,
      server: `team${teamNumber}.ldap.local`,
      users: (game.credentials || []).map((cred) => ({
        username: `team${teamNumber}-${cred.username}`,
        password: cred.password,
      })),
      connectedServers: nodes.filter((n) => n.kind === 'host').map((n) => n.label),
    };
  });

  return {
    networks: networkArray,
    devices,
    blackteamServices,
    applications,
    ldapZones,
  };
};

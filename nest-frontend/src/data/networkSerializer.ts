import { NetworkSnapshot, PersistedNode, PersistedLink, PersistedInterface } from './networkStorage';
import { Game } from './games';
import { serviceDefinitionsById } from './services';

/**
 * Helper to calculate IP addresses for black team services based on the game CIDR.
 */
export const generateServiceIp = (cidr: string | undefined, index: number): string => {
  const baseCidr = cidr || '10.0.0.0/16';
  // Replace T with 0
  const cleanCidr = baseCidr.replace('T', '0');
  const ipPart = cleanCidr.split('/')[0];
  const octets = ipPart.split('.').map(Number);

  // Set last octet to 10 + index
  // Assuming a /24 or larger network where the last octet is available
  octets[3] = 10 + index;

  return octets.join('.');
};

/**
 * CyberGame payload types matching the Go backend types.CyberGame struct.
 * This is what the Python tfparser.py expects to receive.
 */
/** Per-service configuration sent to the backend and consumed by Ansible scripts. */
export interface ServiceConfig {
  port: number;
  protocol: string;
  /** Arbitrary key-value pairs passed through to Ansible templates. */
  ansibleMeta?: Record<string, string>;
  /** Whether this service is scored by the scoring engine. */
  scored?: boolean;
  /** Points awarded per scoring cycle (1–100). */
  scoringPoints?: number;
}

export interface CyberGamePayload {
  name: string;
  networks: { name: string; cidr: string }[];
  devices: CyberGameDevice[];
  blackteamServices: { name: string; templateId: number; hostId: number; ip: string }[];
  applications: { name: string; servers: string[]; services: string[]; color: string }[];
  teamCount?: number;
  /** Scoring check interval in seconds (15–300). Present when a scoring engine is enabled. */
  scoringCheckInterval?: number;
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
  /** Legacy port-only map (kept for backwards compatibility with tfparser.py). */
  services: Record<string, number>;
  /** Rich service configuration with Ansible metadata, keyed by service name. */
  serviceConfigs?: Record<string, ServiceConfig>;
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
 * Checks if an interface is connected to the competition network.
 * An interface is on the comp network if its IP contains 'T' (the team placeholder).
 */
const isCompNetworkInterface = (intf: PersistedInterface, blackTeamCidr?: string): boolean => {
  if (!blackTeamCidr) return false;
  return intf.networkCidr === blackTeamCidr || Boolean(intf.ip && intf.ip.includes('T'));
};

/**
 * Collects all unique network CIDRs from router interfaces.
 * Returns a map of network name -> CIDR.
 */
const collectNetworks = (
  nodes: PersistedNode[],
  links: PersistedLink[],
  blackTeamCidr?: string,
): Map<string, string> => {
  const networks = new Map<string, string>();

  for (const node of nodes) {
    if (node.kind !== 'router') continue;
    for (const intf of node.interfaces) {
      if (!intf.networkCidr) continue;

      // If this interface is on the competition network, emit the External WAN entry
      if (isCompNetworkInterface(intf, blackTeamCidr)) {
        const cidr = intf.networkCidr;
        const [ip, prefix] = cidr.split('/');
        const octets = ip.split('.');
        // Replace the third octet with T for team numbering
        octets[2] = 'T';
        octets[3] = '0';
        networks.set('External WAN', `${octets.join('.')}/${prefix}`);
        continue;
      }

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

      if (!connectsToRouter) {
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
  const networkMap = collectNetworks(nodes, links, game.blackTeamCidr);
  const networkArray = Array.from(networkMap.entries()).map(([name, cidr]) => ({
    name,
    cidr,
  }));

  // 2. Convert nodes to devices
  const devices: CyberGameDevice[] = [];

  for (const node of nodes) {
    if (node.kind === 'router') {
      const interfaces: Record<string, string> = {};

      for (const intf of node.interfaces) {
        if (!intf.networkCidr && !intf.ip) {
          interfaces[intf.name] = '';
          continue;
        }

        // If this interface is on the competition network, mark as External WAN
        // and use the T-based IP for the backend to substitute
        if (isCompNetworkInterface(intf, game.blackTeamCidr)) {
          interfaces[intf.name] = 'External WAN';
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
        } else {
          // LAN interface
          interfaces[intf.name] = intf.ip ? `${intf.ip}/${intf.networkCidr?.split('/')[1] || '24'}` : '';
        }
      }

      const imageId = parseInt(node.imageId, 10);

      // A router is "infra" (competition router) if it has no comp network interface
      // and has imageId < 0. But now we detect it by checking if any interface is
      // connected to the comp network — if none are, and it's connected to a router
      // that IS on the comp network, it's a team router.
      const hasCompInterface = node.interfaces.some((i) => isCompNetworkInterface(i, game.blackTeamCidr));
      // If no comp interface, treat hostId as the image ID for team routers
      const infra = hasCompInterface ? false : imageId < 0;

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

      // Build services map (legacy) and rich service configs
      const services: Record<string, number> = {};
      const serviceConfigs: Record<string, ServiceConfig> = {};
      for (const svc of node.services || []) {
        const def = serviceDefinitionsById[svc.serviceId];
        const name = def?.name || svc.serviceId;
        services[name] = svc.port;
        serviceConfigs[name] = {
          port: svc.port,
          protocol: svc.protocol,
          ...(svc.ansibleMeta && Object.keys(svc.ansibleMeta).length > 0
            ? { ansibleMeta: svc.ansibleMeta }
            : {}),
          ...(svc.scored ? { scored: true, scoringPoints: svc.scoringPoints } : {}),
        };
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
        serviceConfigs,
      });
    }
  }

  // 3. Build blackteam services from game RvB services
  const blackteamServices = (game.rvbServices || []).map((service, index) => ({
    name: service,
    templateId: index + 1,
    hostId: index + 1,
    ip: generateServiceIp(game.blackTeamCidr, index),
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

  return {
    name: game.name,
    networks: networkArray,
    devices,
    blackteamServices,
    applications,
    ...(game.scoringCheckInterval ? { scoringCheckInterval: game.scoringCheckInterval } : {}),
  };
};

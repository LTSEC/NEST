import { CyberGameDevice, CyberGamePayload } from './networkSerializer';
import { NetworkSnapshot, PersistedNode, PersistedLink, PersistedInterface } from './networkStorage';

const createId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10));

const LAYOUT_START_X = 200;
const LAYOUT_START_Y = 120;
const ROUTER_SPACING_X = 400;
const HOST_SPACING_X = 280;
const HOST_OFFSET_Y = 280;

export const presetToSnapshot = (preset: CyberGamePayload, gameId: string | null): NetworkSnapshot => {
  const nodes: PersistedNode[] = [];
  const links: PersistedLink[] = [];

  const routerNodes = new Map<string, PersistedNode>();
  const routerInterfaceMap = new Map<string, string>(); // RouterName:InterfaceName -> InterfaceId

  // Track which router each host connects to for layout grouping
  const routerHostCount = new Map<string, number>();

  let routerX = LAYOUT_START_X;

  // 1. Create Router Nodes
  preset.devices
    .filter((d) => d.type === 'Router')
    .forEach((device) => {
      const nodeId = createId();
      const interfaces: PersistedInterface[] = [];

      if (device.interfaces) {
        Object.entries(device.interfaces).forEach(([name, value]) => {
          const interfaceId = createId();
          const isWan = value.includes('External WAN') || value === 'External WAN';
          const [ip, prefix] = value.includes('/') ? value.split('/') : [value, ''];
          const cidr = isWan ? undefined : (ip && prefix ? `${ip.split('.').slice(0, 3).join('.')}.0/${prefix}` : undefined);

          interfaces.push({
            id: interfaceId,
            name: name,
            ip: ip && !isWan ? ip : undefined,
            networkCidr: cidr,
          });

          routerInterfaceMap.set(`${device.name}:${name}`, interfaceId);
        });
      }

      // Ensure at least eth0, eth1 if not present (default behavior in editor)
      if (!interfaces.find(i => i.name === 'eth0')) interfaces.push({ id: createId(), name: 'eth0' });
      if (!interfaces.find(i => i.name === 'eth1')) interfaces.push({ id: createId(), name: 'eth1' });

      const node: PersistedNode = {
        id: nodeId,
        label: device.name,
        imageId: (device.os?.id || -1).toString(),
        kind: 'router',
        position: { x: routerX, y: LAYOUT_START_Y },
        interfaces,
        services: [],
      };

      routerNodes.set(device.name, node);
      routerHostCount.set(device.name, 0);
      nodes.push(node);
      routerX += ROUTER_SPACING_X;
    });

  // 2. Create Host Nodes & Connect to Routers
  preset.devices
    .filter((d) => d.type === 'Server')
    .forEach((device) => {
      const nodeId = createId();
      const interfaceId = createId();

      let targetRouterInterfaceId: string | undefined = undefined;
      let networkCidr: string | undefined = undefined;
      let connectedRouterName: string | undefined = undefined;

      if (device.router && device.interface) {
        const routerNode = routerNodes.get(device.router);
        const routerIntfId = routerInterfaceMap.get(`${device.router}:${device.interface}`);

        if (routerNode && routerIntfId) {
          const routerIntf = routerNode.interfaces.find(i => i.id === routerIntfId);
          networkCidr = routerIntf?.networkCidr;

          // If the named interface has no CIDR (e.g. it's the External WAN / comp-network uplink),
          // fall back to the first LAN-side interface that does have a CIDR so the host has
          // a valid network context and the link is not created with an empty networkCidr.
          let effectiveIntfId = routerIntfId;
          if (!networkCidr) {
            const fallbackIntf = routerNode.interfaces.find(
              (i) => i.id !== routerIntfId && i.networkCidr,
            );
            if (fallbackIntf) {
              networkCidr = fallbackIntf.networkCidr;
              effectiveIntfId = fallbackIntf.id;
            }
          }

          targetRouterInterfaceId = `${routerNode.id}:${effectiveIntfId}`;
          connectedRouterName = device.router;

          // Create Link
          links.push({
            id: createId(),
            from: { nodeId: nodeId, interfaceId: interfaceId },
            to: { nodeId: routerNode.id, interfaceId: effectiveIntfId },
            networkCidr: networkCidr || '',
          });
        }
      }

      // Position hosts below their connected router, grouped
      let hostX = LAYOUT_START_X;
      const hostY = LAYOUT_START_Y + HOST_OFFSET_Y;

      if (connectedRouterName) {
        const routerNode = routerNodes.get(connectedRouterName);
        const hostIndex = routerHostCount.get(connectedRouterName) ?? 0;
        routerHostCount.set(connectedRouterName, hostIndex + 1);

        if (routerNode) {
          // Center hosts under their router, offset by index
          hostX = routerNode.position.x + (hostIndex * HOST_SPACING_X) - (HOST_SPACING_X * 0.5 * Math.max(0, hostIndex - 1));
        }
      }

      const node: PersistedNode = {
        id: nodeId,
        label: device.name,
        imageId: (device.os?.id || 0).toString(),
        kind: 'host',
        position: { x: hostX, y: hostY },
        interfaces: [{
          id: interfaceId,
          name: 'eth0',
          ip: device.ip,
          dhcpEnabled: device.dhcp,
          targetRouterInterfaceId,
          networkCidr
        }],
        services: [],
      };

      nodes.push(node);
    });

  return {
    gameId,
    savedAt: new Date().toISOString(),
    gridSnapEnabled: true,
    nodes,
    links,
    customServices: [],
  };
};

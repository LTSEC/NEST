import { CyberGameDevice, CyberGamePayload } from './networkSerializer';
import { NetworkSnapshot, PersistedNode, PersistedLink, PersistedInterface } from './networkStorage';

const createId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10));

const LAYOUT_START_X = 100;
const LAYOUT_START_Y = 100;
const GRID_SPACING_X = 250;
const GRID_SPACING_Y = 200;

export const presetToSnapshot = (preset: CyberGamePayload, gameId: string | null): NetworkSnapshot => {
  const nodes: PersistedNode[] = [];
  const links: PersistedLink[] = [];

  const routerNodes = new Map<string, PersistedNode>();
  const routerInterfaceMap = new Map<string, string>(); // RouterName:InterfaceName -> InterfaceId

  let routerX = LAYOUT_START_X;
  let hostX = LAYOUT_START_X;

  // 1. Create Router Nodes
  preset.devices
    .filter((d) => d.type === 'Router')
    .forEach((device) => {
      const nodeId = createId();
      const interfaces: PersistedInterface[] = [];

      if (device.interfaces) {
        Object.entries(device.interfaces).forEach(([name, value]) => {
          const interfaceId = createId();
          const [ip, prefix] = value.includes('/') ? value.split('/') : [value, ''];
          const cidr = value.includes('External WAN') ? undefined : (ip && prefix ? `${ip.split('.').slice(0, 3).join('.')}.0/${prefix}` : undefined);

          interfaces.push({
            id: interfaceId,
            name: name,
            ip: ip && !value.includes('External WAN') ? ip : undefined,
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
      nodes.push(node);
      routerX += GRID_SPACING_X;
    });

  // 2. Create Host Nodes & Connect to Routers
  preset.devices
    .filter((d) => d.type === 'Server')
    .forEach((device) => {
      const nodeId = createId();
      const interfaceId = createId();

      let targetRouterInterfaceId: string | undefined = undefined;
      let networkCidr: string | undefined = undefined;

      if (device.router && device.interface) {
        const routerNode = routerNodes.get(device.router);
        const routerIntfId = routerInterfaceMap.get(`${device.router}:${device.interface}`);

        if (routerNode && routerIntfId) {
          targetRouterInterfaceId = `${routerNode.id}:${routerIntfId}`;
          const routerIntf = routerNode.interfaces.find(i => i.id === routerIntfId);
          networkCidr = routerIntf?.networkCidr;

          // Create Link
          links.push({
            id: createId(),
            from: { nodeId: nodeId, interfaceId: interfaceId },
            to: { nodeId: routerNode.id, interfaceId: routerIntfId },
            networkCidr: networkCidr || '',
          });
        }
      }

      const node: PersistedNode = {
        id: nodeId,
        label: device.name,
        imageId: (device.os?.id || 0).toString(),
        kind: 'host',
        position: { x: hostX, y: LAYOUT_START_Y + GRID_SPACING_Y },
        interfaces: [{
          id: interfaceId,
          name: 'eth0',
          ip: device.ip,
          dhcpEnabled: device.dhcp,
          targetRouterInterfaceId,
          networkCidr
        }],
        services: [], // Services could be populated from device.services if needed
      };

      // Populate services? device.services is Record<string, number> (Name -> Port)
      // But we need ServiceInstance with serviceId. We'd need to lookup serviceDefinitionsById.
      // For now, let's skip or implement if crucial. The prompt says "shows the VMs", which we have.

      nodes.push(node);
      hostX += GRID_SPACING_X;
    });

  return {
    gameId,
    savedAt: new Date().toISOString(),
    gridSnapEnabled: true,
    nodes,
    links,
    customServices: [], // Presets generally don't have custom services defined this way yet?
  };
};

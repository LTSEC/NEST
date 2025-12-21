import rawItems from '../../../network-items.yaml?raw';

type NetworkItemCategory = 'router' | 'host';

type RawItem = {
  name: string;
  id?: string;
};

type RawRegistry = {
  routers?: RawItem[];
  hosts?: RawItem[];
};

export interface NetworkItemDefinition {
  id: string;
  label: string;
  category: NetworkItemCategory;
}

const generateId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `item-${Math.random().toString(36).slice(2, 10)}`);

const toDefinitions = (
  items: RawItem[] | undefined,
  category: NetworkItemCategory,
  usedIds: Set<string>,
): NetworkItemDefinition[] => {
  if (!items) return [];
  return items.reduce<NetworkItemDefinition[]>((acc, item) => {
    const label = item.name?.trim();
    if (!label) return acc;

    let itemId = item.id?.trim();
    if (!itemId || usedIds.has(itemId)) {
      itemId = generateId();
    }
    usedIds.add(itemId);

    acc.push({ id: itemId, label, category });
    return acc;
  }, []);
};

const parseRegistry = (raw: string): RawRegistry => {
  const registry: RawRegistry = { routers: [], hosts: [] };
  let current: RawItem[] | undefined;

  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const sectionMatch = trimmed.match(/^([a-zA-Z]+):$/);
    if (sectionMatch) {
      const key = sectionMatch[1] as keyof RawRegistry;
      current = registry[key];
      return;
    }

    if (trimmed.startsWith('- ')) {
      const remainder = trimmed.slice(2).trim();
      const newItem: RawItem = { name: '' };

      if (remainder.includes(':')) {
        const [inlineKey, ...rest] = remainder.split(':');
        const value = rest.join(':').trim();
        if (inlineKey === 'name') newItem.name = value;
        if (inlineKey === 'id') newItem.id = value;
      }

      current?.push(newItem);
      return;
    }

    const detailMatch = trimmed.match(/^([a-zA-Z]+):\s*(.+)$/);
    if (detailMatch && current && current.length > 0) {
      const [, key, value] = detailMatch;
      const lastItem = current[current.length - 1];
      if (key === 'name') lastItem.name = value.trim();
      if (key === 'id') lastItem.id = value.trim();
    }
  });

  return registry;
};

const parsed = parseRegistry(rawItems);
const usedIds = new Set<string>();

export const networkItemsRegistry: NetworkItemDefinition[] = [
  ...toDefinitions(parsed.routers, 'router', usedIds),
  ...toDefinitions(parsed.hosts, 'host', usedIds),
];

export const networkItemsByCategory = networkItemsRegistry.reduce<Record<NetworkItemCategory, NetworkItemDefinition[]>>(
  (acc, item) => {
    acc[item.category].push(item);
    return acc;
  },
  { router: [], host: [] },
);

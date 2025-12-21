export interface PersistedInterface {
  id: string;
  name: string;
  ip?: string;
  networkCidr?: string;
  targetRouterInterfaceId?: string;
  dhcpEnabled?: boolean;
}

export interface PersistedNode {
  id: string;
  label: string;
  imageId: string;
  kind: 'router' | 'host';
  position: { x: number; y: number };
  interfaces: PersistedInterface[];
}

export interface PersistedLinkEnd {
  nodeId: string;
  interfaceId: string;
}

export interface PersistedLink {
  id: string;
  from: PersistedLinkEnd;
  to: PersistedLinkEnd;
  networkCidr: string;
}

export interface NetworkSnapshot {
  gameId: string | null;
  savedAt: string;
  gridSnapEnabled: boolean;
  nodes: PersistedNode[];
  links: PersistedLink[];
  metadata?: Record<string, unknown>;
}

const inMemoryStore = new Map<string, NetworkSnapshot>();

const storageKey = (gameId: string | null) => `nest-network-${gameId ?? 'global'}`;

export const saveNetworkSnapshot = (gameId: string | null, snapshot: NetworkSnapshot) => {
  const key = storageKey(gameId);
  inMemoryStore.set(key, snapshot);
  try {
    localStorage.setItem(key, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('Failed to persist network snapshot to localStorage', error);
  }
};

export const loadNetworkSnapshot = (gameId: string | null): NetworkSnapshot | null => {
  const key = storageKey(gameId);
  if (inMemoryStore.has(key)) {
    return inMemoryStore.get(key) || null;
  }

  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored) as NetworkSnapshot;
      inMemoryStore.set(key, parsed);
      return parsed;
    }
  } catch (error) {
    console.warn('Failed to load network snapshot', error);
  }

  return null;
};

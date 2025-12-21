import { NetworkAssetsRegistry, networkAssets } from './networkAssets';

export type NetworkCategory = 'router' | 'host';

export interface NetworkItem {
  id: string;
  label: string;
  category: NetworkCategory;
}

interface RegistryEntry {
  id: string;
  label: string;
}

const normalizeEntries = (
  source: RegistryEntry[] | Record<string, string> | undefined,
  category: NetworkCategory,
): NetworkItem[] => {
  if (!source) return [];

  if (Array.isArray(source)) {
    return source
      .filter((entry): entry is RegistryEntry => Boolean(entry?.id && entry?.label))
      .map((entry) => ({ ...entry, category }));
  }

  return Object.entries(source)
    .filter(([, id]) => Boolean(id))
    .map(([label, id]) => ({ id: String(id), label, category }));
};

const parsedRegistry: NetworkAssetsRegistry = networkAssets;

export const networkItems: NetworkItem[] = [
  ...normalizeEntries(parsedRegistry.routers, 'router'),
  ...normalizeEntries(parsedRegistry.hosts, 'host'),
];

export const networkItemsByCategory: Record<NetworkCategory, NetworkItem[]> = networkItems.reduce(
  (categories, item) => ({
    ...categories,
    [item.category]: [...(categories[item.category] ?? []), item],
  }),
  { router: [], host: [] },
);

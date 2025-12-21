import rawRegistry from '../assets/network-assets.yaml?raw';

export interface RegistryEntry {
  id: string;
  label: string;
}

export interface ServiceDefinition {
  id: string;
  name: string;
  description?: string;
  protocol?: 'tcp' | 'udp';
  defaultPort?: number;
  roles?: string[];
  dependencies?: string[];
}

export interface CustomServiceRole {
  role: string;
  serviceId: string;
  hostImageId?: string;
  defaultPort?: number;
}

export interface CustomServiceDefinition {
  id: string;
  name: string;
  description?: string;
  requiredRoles?: CustomServiceRole[];
  dependencies?: string[];
}

export interface NetworkAssetsRegistry {
  routers?: RegistryEntry[] | Record<string, string>;
  hosts?: RegistryEntry[] | Record<string, string>;
  services?: ServiceDefinition[];
  customServices?: CustomServiceDefinition[];
}

export const networkAssets: NetworkAssetsRegistry = (() => {
  try {
    const parsed = JSON.parse(rawRegistry) as NetworkAssetsRegistry;
    return parsed ?? {};
  } catch (error) {
    console.error('Failed to parse network assets registry', error);
    return {};
  }
})();

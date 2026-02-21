import rawRegistry from '../assets/network-assets.yaml?raw';

export interface RegistryEntry {
  id: string;
  label: string;
}

/** Describes an Ansible-configurable field that a service definition exposes. */
export interface AnsibleMetaField {
  /** Machine-readable key written into ansibleMeta (e.g. "ssh_user"). */
  key: string;
  /** Human-readable label shown in the UI (e.g. "SSH User"). */
  label: string;
  /** Default value pre-filled in the configuration modal. */
  defaultValue?: string;
  /** Optional hint/placeholder text. */
  placeholder?: string;
}

export interface ServiceDefinition {
  id: string;
  name: string;
  description?: string;
  protocol?: 'tcp' | 'udp';
  defaultPort?: number;
  roles?: string[];
  dependencies?: string[];
  /** Ansible-configurable fields exposed by this service. */
  ansibleFields?: AnsibleMetaField[];
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

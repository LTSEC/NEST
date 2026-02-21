import { CustomServiceDefinition, networkAssets, ServiceDefinition } from './networkAssets';

const normalizeServices = (services: ServiceDefinition[] | undefined): ServiceDefinition[] => {
  if (!services) return [];
  return services
    .filter((service): service is ServiceDefinition => Boolean(service?.id && service?.name))
    .map((service) => ({
      ...service,
      protocol: service.protocol === 'udp' ? 'udp' : 'tcp',
      defaultPort: typeof service.defaultPort === 'number' ? service.defaultPort : undefined,
      roles: Array.isArray(service.roles) ? service.roles : [],
      dependencies: Array.isArray(service.dependencies) ? service.dependencies : [],
      ansibleFields: Array.isArray(service.ansibleFields) ? service.ansibleFields : [],
    }));
};

const normalizeCustomServices = (customServices: CustomServiceDefinition[] | undefined): CustomServiceDefinition[] => {
  if (!customServices) return [];
  return customServices
    .filter((service): service is CustomServiceDefinition => Boolean(service?.id && service?.name))
    .map((service) => ({
      ...service,
      requiredRoles: Array.isArray(service.requiredRoles)
        ? service.requiredRoles.filter((role) => Boolean(role.role && role.serviceId))
        : [],
      dependencies: Array.isArray(service.dependencies) ? service.dependencies : [],
    }));
};

export const serviceCatalog: ServiceDefinition[] = normalizeServices(networkAssets.services);
export const customServiceCatalog: CustomServiceDefinition[] = normalizeCustomServices(networkAssets.customServices);

export const serviceDefinitionsById = serviceCatalog.reduce<Record<string, ServiceDefinition>>(
  (all, current) => ({
    ...all,
    [current.id]: current,
  }),
  {},
);

export const customServicesById = customServiceCatalog.reduce<Record<string, CustomServiceDefinition>>(
  (all, current) => ({
    ...all,
    [current.id]: current,
  }),
  {},
);

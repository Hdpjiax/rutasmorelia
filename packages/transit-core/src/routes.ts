import type {RouteIndexEntry, RouteItem} from './types';

export function isCombiTransportType(transportType?: string): boolean {
  const type = (transportType || '').toLocaleLowerCase('es-MX');
  return type.includes('combi') || type.includes('microbus') || type.includes('microbús');
}

export function formatRouteNumber(id: string | number, transportType?: string): string {
  const idStr = String(id);
  const prefix = isCombiTransportType(transportType) ? 'C' : 'A';
  return `${prefix}${idStr.replace(/\D/g, '') || idStr}`;
}

export function mapRouteFromIndex(route: RouteIndexEntry): RouteItem {
  const id = String(route.id);
  const isCombi = isCombiTransportType(route.transportType);
  return {
    id,
    geometryId: id,
    number: formatRouteNumber(id, route.transportType),
    name: route.name,
    detail: isCombi ? 'Combi' : 'Camión',
    time: 'Ver recorrido',
    color: route.color || '#FFA500',
  };
}
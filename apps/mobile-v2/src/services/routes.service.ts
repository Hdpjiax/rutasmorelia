import {
  mapRouteFromIndex,
  ROUTES_CACHE_KEY,
  type RouteIndexEntry,
  type RouteItem,
} from '@rutas-morelia/transit-core';
import type {KeyValueStorage} from './storage/storage.interface';
import {getRouteFetchBases, isLocalBaseUrl} from '../lib/routes-config';

export const MIN_EXPECTED_ROUTES = 50;

export const FALLBACK_ROUTES: RouteItem[] = [
  {id: '78', geometryId: '78', number: 'A78', name: 'Alberca (Metropolis)', detail: 'Camión', time: 'Ver recorrido', color: '#FFC800'},
  {id: '3', geometryId: '3', number: 'C3', name: 'Amarilla 1 Centro', detail: 'Combi', time: 'Ver recorrido', color: '#E5B900'},
  {id: '79', geometryId: '79', number: 'C79', name: 'Alberca Gertrudis', detail: 'Combi', time: 'Ver recorrido', color: '#6F7E24'},
];

type RoutesIndexPayload = {
  routes?: RouteIndexEntry[];
};

export function parseRoutesIndex(payload: unknown): RouteIndexEntry[] {
  if (!payload || typeof payload !== 'object') return [];
  const routes = (payload as RoutesIndexPayload).routes;
  if (!Array.isArray(routes)) return [];
  return routes
    .filter(route => route && route.id != null && route.name)
    .map(route => ({
      id: route.id,
      name: String(route.name),
      color: route.color,
      transportType: route.transportType,
    }));
}

export function mapRoutesFromIndex(entries: RouteIndexEntry[]): RouteItem[] {
  return entries.map(entry => mapRouteFromIndex(entry));
}

export function isReliableRouteCatalog(routes: RouteItem[]): boolean {
  return routes.length >= MIN_EXPECTED_ROUTES;
}

async function fetchRoutesFromBase(
  base: string,
  signal?: AbortSignal,
  localTimeoutMs = 1200,
): Promise<RouteIndexEntry[]> {
  const fetchController = new AbortController();
  const timeoutId = setTimeout(() => {
    if (isLocalBaseUrl(base)) fetchController.abort();
  }, localTimeoutMs);

  try {
    const response = await fetch(`${base}/index.json`, {
      signal: signal ?? fetchController.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error('routes fetch failed');
    const data = await response.json();
    return parseRoutesIndex(data);
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export async function loadRouteCatalog(
  bases: string[] = getRouteFetchBases(),
  signal?: AbortSignal,
): Promise<RouteItem[]> {
  for (const base of bases) {
    try {
      const entries = await fetchRoutesFromBase(base, signal);
      const mapped = mapRoutesFromIndex(entries);
      if (isReliableRouteCatalog(mapped)) return mapped;
    } catch {
      // try next base
    }
  }
  return FALLBACK_ROUTES;
}

export async function readCachedRoutes(storage: KeyValueStorage): Promise<RouteItem[] | null> {
  try {
    const cached = await storage.getItem(ROUTES_CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as {routes?: RouteItem[]};
    const routes = Array.isArray(parsed.routes) ? parsed.routes : null;
    if (!routes || !isReliableRouteCatalog(routes)) return null;
    return routes;
  } catch {
    return null;
  }
}

export async function writeCachedRoutes(storage: KeyValueStorage, routes: RouteItem[]): Promise<void> {
  if (!isReliableRouteCatalog(routes)) return;
  await storage.setItem(ROUTES_CACHE_KEY, JSON.stringify({savedAt: Date.now(), routes}));
}
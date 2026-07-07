import {
  adjustRouteColorForDarkTheme,
  GEOMETRY_CACHE_PREFIX,
  getGeometryBounds,
  type RouteItem,
} from '@rutas-morelia/transit-core';
import type {FeatureCollection, LineString, MultiLineString} from 'geojson';
import type {KeyValueStorage} from './storage/storage.interface';
import {buildGeojsonUrl, getRouteFetchBases, isLocalBaseUrl} from '../lib/routes-config';
import type {ColorScheme} from '../theme/tokens';

export type CachedGeometry = {
  rawGeojson: FeatureCollection;
  bounds: [number, number, number, number];
};

type RouteGeometry = LineString | MultiLineString;

export function geometryCacheKey(geometryId: string): string {
  return `${GEOMETRY_CACHE_PREFIX}${geometryId}`;
}

export function resolveGeometryIdForActiveRoute(
  activeRouteId: string,
  routes: RouteItem[],
): {geometryId: string; selected: RouteItem | undefined} {
  const selected = routes.find(route => route.id === activeRouteId);
  return {geometryId: selected?.geometryId || activeRouteId, selected};
}

export function normalizeRouteGeojson(
  geojson: FeatureCollection,
  routeId: string,
  route: RouteItem | undefined,
  scheme: ColorScheme,
): FeatureCollection {
  return {
    ...geojson,
    features: geojson.features.map(feature => ({
      ...feature,
      properties: {
        ...feature.properties,
        id: routeId,
        color:
          scheme === 'dark'
            ? adjustRouteColorForDarkTheme(String(feature.properties?.color || route?.color || '#00E5FF'))
            : String(feature.properties?.color || route?.color || '#0097B2'),
      },
    })),
  };
}

export function computeGeometryBounds(geojson: FeatureCollection): [number, number, number, number] | null {
  const geometryBounds = geojson.features
    .map(feature => feature.geometry)
    .filter((geometry): geometry is RouteGeometry => geometry.type === 'LineString' || geometry.type === 'MultiLineString')
    .map(getGeometryBounds)
    .filter((value): value is [number, number, number, number] => Boolean(value));

  if (!geometryBounds.length) return null;

  return geometryBounds.reduce<[number, number, number, number]>(
    (acc, value) => [
      Math.min(acc[0], value[0]),
      Math.min(acc[1], value[1]),
      Math.max(acc[2], value[2]),
      Math.max(acc[3], value[3]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}

async function fetchGeojsonFromBase(
  base: string,
  geometryId: string,
  localTimeoutMs = 1200,
): Promise<CachedGeometry | null> {
  const fetchController = new AbortController();
  const timeoutId = setTimeout(() => {
    if (isLocalBaseUrl(base)) fetchController.abort();
  }, localTimeoutMs);

  try {
    const response = await fetch(buildGeojsonUrl(base, geometryId), {signal: fetchController.signal});
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const geojson = (await response.json()) as FeatureCollection;
    const bounds = computeGeometryBounds(geojson);
    if (!bounds) return null;
    return {rawGeojson: geojson, bounds};
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

export async function loadRouteGeometry(
  geometryId: string,
  bases: string[] = getRouteFetchBases(),
): Promise<CachedGeometry | null> {
  for (const base of bases) {
    const result = await fetchGeojsonFromBase(base, geometryId);
    if (result) return result;
  }
  return null;
}

export async function readCachedGeometry(
  storage: KeyValueStorage,
  geometryId: string,
): Promise<CachedGeometry | null> {
  try {
    const stored = await storage.getItem(geometryCacheKey(geometryId));
    if (!stored) return null;
    const parsed = JSON.parse(stored) as CachedGeometry;
    if (!parsed.rawGeojson || !parsed.bounds) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCachedGeometry(
  storage: KeyValueStorage,
  geometryId: string,
  cached: CachedGeometry,
): Promise<void> {
  await storage.setItem(geometryCacheKey(geometryId), JSON.stringify(cached));
}
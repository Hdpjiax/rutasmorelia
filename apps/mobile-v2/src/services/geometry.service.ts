import {
  adjustRouteColorForDarkTheme,
  GEOMETRY_CACHE_PREFIX,
  getGeometryBounds,
  hasTransfers,
  journeyOptionKey,
  type JourneyOption,
  type RouteItem,
} from '@rutas-morelia/transit-core';
import type {Feature, FeatureCollection, LineString, MultiLineString} from 'geojson';
import type {KeyValueStorage} from './storage/storage.interface';
import {buildGeojsonUrl, getRouteFetchBases, isLocalBaseUrl} from '../lib/routes-config';
import {asyncStorageAdapter} from './storage/async-storage.adapter';
import type {ColorScheme} from '../theme/tokens';
import {effectiveRouteCatalog, resolveRouteCatalogId} from './route-catalog-id';

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

const geometryMemoryCache = new Map<string, CachedGeometry>();

export async function loadRouteGeometryByRef(
  routeRef: string | number,
  routes: RouteItem[],
  scheme: ColorScheme,
  storage: KeyValueStorage = asyncStorageAdapter,
): Promise<{features: Feature[]; bounds: [number, number, number, number] | null}> {
  const catalog = effectiveRouteCatalog(routes);
  const routeId = resolveRouteCatalogId(routeRef, catalog);
  if (!routeId) return {features: [], bounds: null};

  const {geometryId, selected} = resolveGeometryIdForActiveRoute(routeId, catalog);
  let cached = geometryMemoryCache.get(geometryId);
  if (!cached) {
    cached = (await readCachedGeometry(storage, geometryId)) ?? undefined;
    if (cached) geometryMemoryCache.set(geometryId, cached);
  }
  if (!cached) {
    const fetched = await loadRouteGeometry(geometryId);
    if (!fetched) return {features: [], bounds: null};
    geometryMemoryCache.set(geometryId, fetched);
    void writeCachedGeometry(storage, geometryId, fetched);
    cached = fetched;
  }

  const normalized = normalizeRouteGeojson(cached.rawGeojson, routeId, selected, scheme);
  return {features: normalized.features, bounds: cached.bounds};
}

function distinctTransferColor(color: string): string {
  const palette = ['#2563EB', '#DC2626', '#7C3AED', '#EA580C', '#0891B2'];
  const lower = color.toLowerCase();
  const next = palette.find(value => value.toLowerCase() !== lower);
  return next ?? '#2563EB';
}

type JourneyGeometryResult = {
  geojson: FeatureCollection;
  bounds: [number, number, number, number] | null;
};

const journeyGeometryMemoryCache = new Map<string, JourneyGeometryResult>();

function journeyGeometryCacheKey(option: JourneyOption, scheme: ColorScheme): string {
  return `${journeyOptionKey(option)}:${scheme}`;
}

export function getCachedJourneyOptionGeometry(
  option: JourneyOption,
  scheme: ColorScheme,
): JourneyGeometryResult | undefined {
  return journeyGeometryMemoryCache.get(journeyGeometryCacheKey(option, scheme));
}

export function prefetchJourneyOptionsGeometry(
  options: JourneyOption[],
  routes: RouteItem[],
  scheme: ColorScheme,
  storage: KeyValueStorage = asyncStorageAdapter,
): void {
  for (const option of options) {
    const key = journeyGeometryCacheKey(option, scheme);
    if (journeyGeometryMemoryCache.has(key)) continue;
    void loadJourneyOptionGeometry(option, routes, scheme, storage).then(result => {
      journeyGeometryMemoryCache.set(key, result);
    });
  }
}

export async function loadJourneyOptionGeometry(
  option: JourneyOption,
  routes: RouteItem[],
  scheme: ColorScheme,
  storage: KeyValueStorage = asyncStorageAdapter,
): Promise<JourneyGeometryResult> {
  const cacheKey = journeyGeometryCacheKey(option, scheme);
  const cached = journeyGeometryMemoryCache.get(cacheKey);
  if (cached) return cached;
  const primary = await loadRouteGeometryByRef(option.route_code || option.route_id, routes, scheme, storage);
  const features: Feature[] = [...primary.features];
  const boundsList: [number, number, number, number][] = primary.bounds ? [primary.bounds] : [];

  if (hasTransfers(option)) {
    const secondRef = option.second_route_code || option.second_route_id;
    if (secondRef != null) {
      const secondary = await loadRouteGeometryByRef(secondRef, routes, scheme, storage);
      const primaryColor = String(primary.features[0]?.properties?.color || option.route_color || '');
      const secondaryColor = String(secondary.features[0]?.properties?.color || option.second_route_color || '');
      const recolorSecond =
        primaryColor && secondaryColor && primaryColor.toLowerCase() === secondaryColor.toLowerCase();

      features.push(
        ...secondary.features.map(feature => ({
          ...feature,
          properties: {
            ...feature.properties,
            color: recolorSecond ? distinctTransferColor(secondaryColor) : feature.properties?.color,
          },
        })),
      );
      if (secondary.bounds) boundsList.push(secondary.bounds);
    }
  }

  const mergedBounds = boundsList.length
    ? boundsList.reduce<[number, number, number, number]>(
        (acc, value) => [
          Math.min(acc[0], value[0]),
          Math.min(acc[1], value[1]),
          Math.max(acc[2], value[2]),
          Math.max(acc[3], value[3]),
        ],
        boundsList[0],
      )
    : null;

  const result: JourneyGeometryResult = {geojson: {type: 'FeatureCollection', features}, bounds: mergedBounds};
  journeyGeometryMemoryCache.set(cacheKey, result);
  return result;
}
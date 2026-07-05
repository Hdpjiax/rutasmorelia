import {
  adjustRouteColorForDarkTheme,
  GEOMETRY_CACHE_PREFIX,
  getGeometryBounds,
} from '@rutas-morelia/transit-core';
import type {CameraRef} from '@maplibre/maplibre-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useEffect, useRef, useState} from 'react';
import {getRouteFetchBases, isLocalBaseUrl} from '../lib/routes-config';
import type {AppColorScheme} from '../lib/color-scheme';
import type {CachedGeometry, RouteGeometry, RouteItem} from '../types/transit';

type UseRouteGeometryOptions = {
  activeRouteId: string;
  routesList: RouteItem[];
  colorScheme: AppColorScheme;
  camera: React.RefObject<CameraRef | null>;
  routeRequestVersion: number;
};

type RawCachedGeometry = {
  rawGeojson: GeoJSON.FeatureCollection;
  bounds: [number, number, number, number];
};

function normalizeGeojson(
  geojson: GeoJSON.FeatureCollection,
  activeRouteId: string,
  selected: RouteItem | undefined,
  colorScheme: AppColorScheme,
): GeoJSON.FeatureCollection {
  return {
    ...geojson,
    features: geojson.features.map(feature => ({
      ...feature,
      properties: {
        ...feature.properties,
        id: activeRouteId,
        color:
          colorScheme === 'dark'
            ? adjustRouteColorForDarkTheme(
                String(feature.properties?.color || selected?.color || '#FFC800'),
              )
            : String(feature.properties?.color || selected?.color || '#FFC800'),
      },
    })),
  };
}

function geometryCacheKey(geometryId: string) {
  return `${GEOMETRY_CACHE_PREFIX}${geometryId}`;
}

async function readDiskCache(geometryId: string): Promise<RawCachedGeometry | null> {
  try {
    const stored = await AsyncStorage.getItem(geometryCacheKey(geometryId));
    if (!stored) return null;
    const parsed = JSON.parse(stored) as RawCachedGeometry;
    if (!parsed.rawGeojson || !parsed.bounds) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeDiskCache(geometryId: string, cached: RawCachedGeometry) {
  try {
    await AsyncStorage.setItem(geometryCacheKey(geometryId), JSON.stringify(cached));
  } catch {}
}

export function useRouteGeometry({
  activeRouteId,
  routesList,
  colorScheme,
  camera,
  routeRequestVersion,
}: UseRouteGeometryOptions) {
  const [activeRouteGeoJSON, setActiveRouteGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const routeGeometryCache = useRef(new Map<string, RawCachedGeometry>());

  useEffect(() => {
    if (!activeRouteId) return;
    const controller = new AbortController();

    const selected = routesList.find(route => route.id === activeRouteId);
    const geometryId = selected?.geometryId || activeRouteId;

    function showGeometry(cached: RawCachedGeometry, duration: number) {
      setActiveRouteGeoJSON(normalizeGeojson(cached.rawGeojson, activeRouteId, selected, colorScheme));
      camera.current?.fitBounds(cached.bounds, {
        padding: {top: 132, right: 32, bottom: 72, left: 32},
        duration,
      });
    }

    async function fetchGeometry(): Promise<RawCachedGeometry | null> {
      const bases = getRouteFetchBases();

      for (const base of bases) {
        const url = `${base}/${encodeURIComponent(geometryId)}.geojson`;
        const fetchController = new AbortController();
        const timeoutId = setTimeout(() => {
          if (isLocalBaseUrl(base)) fetchController.abort();
        }, 1200);

        try {
          const response = await fetch(url, {signal: fetchController.signal});
          clearTimeout(timeoutId);
          if (!response.ok) continue;

          const geojson = (await response.json()) as GeoJSON.FeatureCollection;
          const geometryBounds = geojson.features
            .map(feature => feature.geometry)
            .filter(
              (geometry): geometry is RouteGeometry =>
                geometry.type === 'LineString' || geometry.type === 'MultiLineString',
            )
            .map(getGeometryBounds)
            .filter((value): value is [number, number, number, number] => Boolean(value));

          if (!geometryBounds.length) continue;

          const bounds = geometryBounds.reduce<[number, number, number, number]>(
            (acc, value) => [
              Math.min(acc[0], value[0]),
              Math.min(acc[1], value[1]),
              Math.max(acc[2], value[2]),
              Math.max(acc[3], value[3]),
            ],
            [Infinity, Infinity, -Infinity, -Infinity],
          );

          return {rawGeojson: geojson, bounds};
        } catch {
          clearTimeout(timeoutId);
        }
      }

      return null;
    }

    async function loadRouteGeometry() {
      setRouteLoading(true);
      setRouteError(null);

      if (!geometryId) {
        setRouteError('Esta ruta no tiene un recorrido disponible.');
        setRouteLoading(false);
        return;
      }

      let cached = routeGeometryCache.current.get(geometryId);
      if (!cached) {
        cached = (await readDiskCache(geometryId)) ?? undefined;
        if (cached) routeGeometryCache.current.set(geometryId, cached);
      }

      if (cached) {
        showGeometry(cached, 220);
        setRouteLoading(false);
        return;
      }

      const fetched = await fetchGeometry();
      if (controller.signal.aborted) return;

      if (!fetched) {
        setRouteError('No pudimos cargar esta ruta. Toca para reintentar.');
        setRouteLoading(false);
        return;
      }

      routeGeometryCache.current.set(geometryId, fetched);
      if (routeGeometryCache.current.size > 16) {
        const oldestKey = routeGeometryCache.current.keys().next().value;
        if (oldestKey) routeGeometryCache.current.delete(oldestKey);
      }
      void writeDiskCache(geometryId, fetched);
      showGeometry(fetched, 320);
      setRouteLoading(false);
    }

    const memoryCached = routeGeometryCache.current.get(geometryId);
    if (memoryCached) {
      routeGeometryCache.current.delete(geometryId);
      routeGeometryCache.current.set(geometryId, memoryCached);
      setRouteLoading(false);
      setRouteError(null);
      showGeometry(memoryCached, 180);
      return () => controller.abort();
    }

    void loadRouteGeometry();
    return () => controller.abort();
  }, [activeRouteId, routeRequestVersion, routesList, colorScheme, camera]);

  return {activeRouteGeoJSON, routeLoading, routeError, setActiveRouteGeoJSON};
}
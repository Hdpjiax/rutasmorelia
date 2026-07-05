import {adjustRouteColorForDarkTheme, getGeometryBounds} from '@rutas-morelia/transit-core';
import type {CameraRef} from '@maplibre/maplibre-react-native';
import {useEffect, useRef, useState} from 'react';
import {isLocalBaseUrl, LOCAL_ROUTES_BASE_URL, PUBLISHED_ROUTES_BASE_URL} from '../lib/routes-config';
import type {AppColorScheme} from '../lib/color-scheme';
import type {CachedGeometry, RouteGeometry, RouteItem} from '../types/transit';

type UseRouteGeometryOptions = {
  activeRouteId: string;
  routesList: RouteItem[];
  colorScheme: AppColorScheme;
  camera: React.RefObject<CameraRef | null>;
  routeRequestVersion: number;
};

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
  const routeGeometryCache = useRef(new Map<string, CachedGeometry>());

  useEffect(() => {
    if (!activeRouteId) return;
    const controller = new AbortController();

    function showGeometry(cached: CachedGeometry, duration: number) {
      setActiveRouteGeoJSON(cached.geojson);
      camera.current?.fitBounds(cached.bounds, {
        padding: {top: 132, right: 32, bottom: 72, left: 32},
        duration,
      });
    }

    async function loadRouteGeometry() {
      setRouteLoading(true);
      setRouteError(null);
      setActiveRouteGeoJSON(null);

      const selected = routesList.find(route => route.id === activeRouteId);
      const geometryId = selected?.geometryId || activeRouteId;
      if (!geometryId) {
        setRouteError('Esta ruta no tiene un recorrido disponible.');
        setRouteLoading(false);
        return;
      }

      const bases = [LOCAL_ROUTES_BASE_URL, PUBLISHED_ROUTES_BASE_URL];
      let loaded = false;

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

          const normalized: GeoJSON.FeatureCollection = {
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

          const nextCached = {geojson: normalized, bounds};
          routeGeometryCache.current.set(activeRouteId, nextCached);
          if (routeGeometryCache.current.size > 12) {
            const oldestKey = routeGeometryCache.current.keys().next().value;
            if (oldestKey) routeGeometryCache.current.delete(oldestKey);
          }

          showGeometry(nextCached, 380);
          loaded = true;
          break;
        } catch {
          clearTimeout(timeoutId);
        }
      }

      setRouteLoading(false);
      if (!loaded && !controller.signal.aborted) {
        setRouteError('No pudimos cargar esta ruta. Toca para reintentar.');
      }
    }

    const cached = routeGeometryCache.current.get(activeRouteId);
    if (cached) {
      routeGeometryCache.current.delete(activeRouteId);
      routeGeometryCache.current.set(activeRouteId, cached);
      setRouteLoading(false);
      setRouteError(null);
      showGeometry(cached, 280);
      return () => controller.abort();
    }

    void loadRouteGeometry();
    return () => controller.abort();
  }, [activeRouteId, routeRequestVersion, routesList, colorScheme, camera]);

  return {activeRouteGeoJSON, routeLoading, routeError, setActiveRouteGeoJSON};
}
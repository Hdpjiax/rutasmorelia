import type {CameraRef} from '@maplibre/maplibre-react-native';
import type {FeatureCollection} from 'geojson';
import {useEffect, useRef, useState} from 'react';
import {mapFitDuration, mapFitPadding} from '../lib/map-camera';
import {
  loadRouteGeometry,
  normalizeRouteGeojson,
  readCachedGeometry,
  resolveGeometryIdForActiveRoute,
  writeCachedGeometry,
  type CachedGeometry,
} from '../services/geometry.service';
import {asyncStorageAdapter} from '../services/storage/async-storage.adapter';
import {useTransitStore} from '../stores/transit.store';
import {useUiStore} from '../stores/ui.store';
import {useMapStyle} from './useMapStyle';

export function useRouteGeometry(camera: React.RefObject<CameraRef | null>) {
  const activeRouteId = useTransitStore(s => s.activeRouteId);
  const routes = useTransitStore(s => s.routes);
  const setRouteGeometryLoading = useUiStore(s => s.setRouteGeometryLoading);
  const sheetSnapIndex = useUiStore(s => s.sheetSnapIndex);
  const {scheme} = useMapStyle();
  const [geojson, setGeojson] = useState<FeatureCollection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const memoryCache = useRef(new Map<string, CachedGeometry>());

  useEffect(() => {
    if (!activeRouteId) {
      setGeojson(null);
      return;
    }

    let cancelled = false;
    const {geometryId, selected} = resolveGeometryIdForActiveRoute(activeRouteId, routes);

    const show = (cached: CachedGeometry, fromCache: boolean) => {
      setGeojson(normalizeRouteGeojson(cached.rawGeojson, activeRouteId, selected, scheme));
      camera.current?.fitBounds(cached.bounds, {
        padding: mapFitPadding(0, true),
        duration: mapFitDuration(fromCache),
      });
    };

    async function load() {
      setRouteGeometryLoading(true);
      setError(null);

      let cached = memoryCache.current.get(geometryId);
      if (!cached) {
        cached = (await readCachedGeometry(asyncStorageAdapter, geometryId)) ?? undefined;
        if (cached) memoryCache.current.set(geometryId, cached);
      }

      if (cached) {
        if (!cancelled) {
          show(cached, true);
          setRouteGeometryLoading(false);
        }
        return;
      }

      const fetched = await loadRouteGeometry(geometryId);
      if (cancelled) return;

      if (!fetched) {
        setError('No pudimos cargar esta ruta.');
        setRouteGeometryLoading(false);
        return;
      }

      memoryCache.current.set(geometryId, fetched);
      void writeCachedGeometry(asyncStorageAdapter, geometryId, fetched);
      show(fetched, false);
      setRouteGeometryLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeRouteId, camera, routes, scheme, setRouteGeometryLoading, sheetSnapIndex]);

  return {geojson, error};
}
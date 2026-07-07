import type {CameraRef} from '@maplibre/maplibre-react-native';
import type {FeatureCollection} from 'geojson';
import {useEffect, useRef, useState} from 'react';
import {
  loadRouteGeometry,
  normalizeRouteGeojson,
  readCachedGeometry,
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
    const selected = routes.find(route => route.id === activeRouteId);
    const geometryId = selected?.geometryId || activeRouteId;

    const show = (cached: CachedGeometry, duration: number) => {
      setGeojson(normalizeRouteGeojson(cached.rawGeojson, activeRouteId, selected, scheme));
      camera.current?.fitBounds(cached.bounds, {
        padding: {top: 140, right: 28, bottom: 200, left: 28},
        duration,
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
          show(cached, 220);
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
      show(fetched, 320);
      setRouteGeometryLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeRouteId, camera, routes, scheme, setRouteGeometryLoading]);

  return {geojson, error};
}
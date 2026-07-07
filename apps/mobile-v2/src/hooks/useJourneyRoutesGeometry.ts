import type {Coordinates} from '@rutas-morelia/transit-core';
import {journeyOptionKey} from '@rutas-morelia/transit-core';
import type {CameraRef} from '@maplibre/maplibre-react-native';
import type {FeatureCollection} from 'geojson';
import {useEffect, useRef, useState} from 'react';
import {mapFitDuration, mapFitPadding} from '../lib/map-camera';
import {sanitizeRouteLineGeojson} from '../lib/map-geo';
import {
  getCachedJourneyOptionGeometry,
  loadJourneyOptionGeometry,
} from '../services/geometry.service';
import {useTransitStore} from '../stores/transit.store';
import {useUiStore} from '../stores/ui.store';
import {useMapStyle} from './useMapStyle';

function expandBounds(
  bounds: [number, number, number, number],
  origin: Coordinates | null,
  destination: Coordinates | null,
): [number, number, number, number] {
  let [minLng, minLat, maxLng, maxLat] = bounds;
  if (origin) {
    minLng = Math.min(minLng, origin.longitude);
    minLat = Math.min(minLat, origin.latitude);
    maxLng = Math.max(maxLng, origin.longitude);
    maxLat = Math.max(maxLat, origin.latitude);
  }
  if (destination) {
    minLng = Math.min(minLng, destination.longitude);
    minLat = Math.min(minLat, destination.latitude);
    maxLng = Math.max(maxLng, destination.longitude);
    maxLat = Math.max(maxLat, destination.latitude);
  }
  return [minLng, minLat, maxLng, maxLat];
}

export function useJourneyRoutesGeometry(camera: React.RefObject<CameraRef | null>) {
  const origin = useTransitStore(s => s.origin);
  const destination = useTransitStore(s => s.destination);
  const routes = useTransitStore(s => s.routes);
  const journeyOptions = useTransitStore(s => s.journeyOptions);
  const activeJourneyOption = useTransitStore(s => s.activeJourneyOption);
  const {scheme} = useMapStyle();
  const sheetSnapIndex = useUiStore(s => s.sheetSnapIndex);
  const setRouteGeometryLoading = useUiStore(s => s.setRouteGeometryLoading);
  const routeViewPadding = mapFitPadding(0, true);
  const [activeGeojson, setActiveGeojson] = useState<FeatureCollection | null>(null);
  const lastBoundsRef = useRef<[number, number, number, number] | null>(null);
  const lastOptionKeyRef = useRef<string | null>(null);

  const shouldLoad = Boolean(origin && destination && journeyOptions.length > 0);

  useEffect(() => {
    if (!shouldLoad || !activeJourneyOption) {
      setActiveGeojson(null);
      lastBoundsRef.current = null;
      lastOptionKeyRef.current = null;
      return;
    }

    const selectedOption = activeJourneyOption;
    const optionKey = journeyOptionKey(selectedOption);
    const cached = getCachedJourneyOptionGeometry(selectedOption, scheme);
    let cancelled = false;

    async function loadActive() {
      const fromCache = Boolean(cached);
      if (!fromCache) setRouteGeometryLoading(true);

      const {geojson, bounds} =
        cached ?? (await loadJourneyOptionGeometry(selectedOption, routes, scheme));
      if (cancelled) return;

      const sanitized = sanitizeRouteLineGeojson(geojson);
      setActiveGeojson(sanitized);
      setRouteGeometryLoading(false);

      if (bounds) {
        const padded = expandBounds(bounds, origin, destination);
        lastBoundsRef.current = padded;
        lastOptionKeyRef.current = optionKey;
        camera.current?.fitBounds(padded, {
          padding: routeViewPadding,
          duration: mapFitDuration(fromCache),
        });
      }
    }

    if (cached) {
      const sanitized = sanitizeRouteLineGeojson(cached.geojson);
      setActiveGeojson(sanitized);
      if (cached.bounds) {
        lastBoundsRef.current = expandBounds(cached.bounds, origin, destination);
        lastOptionKeyRef.current = optionKey;
      }
    }

    void loadActive();
    return () => {
      cancelled = true;
    };
  }, [
    activeJourneyOption,
    camera,
    destination,
    origin,
    routes,
    scheme,
    setRouteGeometryLoading,
    shouldLoad,
  ]);

  useEffect(() => {
    if (!lastBoundsRef.current || !lastOptionKeyRef.current) return;
    camera.current?.fitBounds(lastBoundsRef.current, {
      padding: mapFitPadding(sheetSnapIndex, sheetSnapIndex === 0),
      duration: 120,
    });
  }, [camera, sheetSnapIndex]);

  return {
    enabled: shouldLoad,
    activeGeojson,
    activeJourneyOption,
  };
}
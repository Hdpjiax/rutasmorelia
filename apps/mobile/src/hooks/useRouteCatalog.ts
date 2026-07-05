import {mapRouteFromIndex, ROUTES_CACHE_KEY} from '@rutas-morelia/transit-core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useEffect, useState} from 'react';
import {ROUTES} from '../data/demo';
import {isLocalBaseUrl, LOCAL_ROUTES_BASE_URL, PUBLISHED_ROUTES_BASE_URL} from '../lib/routes-config';
import {useTransitStore} from '../store/transit-store';
import type {RouteItem} from '../types/transit';

async function fetchRoutesFromBase(base: string): Promise<Record<string, unknown>[]> {
  const fetchController = new AbortController();
  const timeoutId = setTimeout(() => {
    if (isLocalBaseUrl(base)) fetchController.abort();
  }, 1200);

  try {
    const response = await fetch(`${base}/index.json`, {signal: fetchController.signal});
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error('routes fetch failed');
    const data = await response.json();
    return (data.routes ?? []) as Record<string, unknown>[];
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export function useRouteCatalog() {
  const setActiveRouteId = useTransitStore(s => s.setActiveRouteId);
  const [routesList, setRoutesList] = useState<RouteItem[]>(() => ROUTES.map(route => ({...route})));

  useEffect(() => {
    let cancelled = false;

    function applyRoutes(routes: RouteItem[]) {
      if (cancelled || routes.length === 0) return;
      setRoutesList(routes);
      const selectedId = useTransitStore.getState().activeRouteId;
      if (selectedId && !routes.some(route => route.id === selectedId)) {
        setActiveRouteId(routes[0].id);
      }
    }

    async function loadRoutes() {
      const cachedRoutesPromise = AsyncStorage.getItem(ROUTES_CACHE_KEY).catch(() => null);
      let routesData: Record<string, unknown>[] = [];

      try {
        routesData = await fetchRoutesFromBase(LOCAL_ROUTES_BASE_URL);
      } catch {
        try {
          routesData = await fetchRoutesFromBase(PUBLISHED_ROUTES_BASE_URL);
        } catch {}
      }

      if (routesData.length > 0) {
        const mapped = routesData.map(route =>
          mapRouteFromIndex({
            id: route.id as string | number,
            name: String(route.name),
            color: route.color as string | undefined,
            transportType: route.transportType as string | undefined,
          }),
        );
        applyRoutes(mapped);
        AsyncStorage.setItem(ROUTES_CACHE_KEY, JSON.stringify({savedAt: Date.now(), routes: mapped})).catch(
          () => undefined,
        );
        return;
      }

      const cachedValue = await cachedRoutesPromise;
      if (cachedValue) {
        try {
          const cached = JSON.parse(cachedValue) as {routes: RouteItem[]};
          applyRoutes(cached.routes);
        } catch {}
      }
    }

    void loadRoutes();
    return () => {
      cancelled = true;
    };
  }, [setActiveRouteId]);

  return routesList;
}
import {useEffect} from 'react';
import {loadRouteCatalog, readCachedRoutes, writeCachedRoutes} from '../services/routes.service';
import {asyncStorageAdapter} from '../services/storage/async-storage.adapter';
import {useTransitStore} from '../stores/transit.store';

export function useRouteCatalog() {
  const setRoutes = useTransitStore(s => s.setRoutes);
  const setRoutesLoading = useTransitStore(s => s.setRoutesLoading);
  const setActiveRouteId = useTransitStore(s => s.setActiveRouteId);
  const activeRouteId = useTransitStore(s => s.activeRouteId);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setRoutesLoading(true);
      const cached = await readCachedRoutes(asyncStorageAdapter);
      if (!cancelled && cached) {
        setRoutes(cached);
        if (!activeRouteId && cached[0]) setActiveRouteId(cached[0].id);
      }

      const routes = await loadRouteCatalog();
      if (cancelled) return;
      setRoutes(routes);
      setRoutesLoading(false);
      if (!activeRouteId && routes[0]) setActiveRouteId(routes[0].id);
      await writeCachedRoutes(asyncStorageAdapter, routes);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeRouteId, setActiveRouteId, setRoutes, setRoutesLoading]);
}
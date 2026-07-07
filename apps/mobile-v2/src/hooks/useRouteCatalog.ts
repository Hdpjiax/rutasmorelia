import {useEffect} from 'react';
import {loadRouteCatalog, readCachedRoutes, writeCachedRoutes} from '../services/routes.service';
import {asyncStorageAdapter} from '../services/storage/async-storage.adapter';
import {useTransitStore} from '../stores/transit.store';

export function useRouteCatalog() {
  const setRoutes = useTransitStore(s => s.setRoutes);
  const setRoutesLoading = useTransitStore(s => s.setRoutesLoading);
  const setRoutesError = useTransitStore(s => s.setRoutesError);
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setRoutesLoading(true);
      setRoutesError(null);

      const cached = await readCachedRoutes(asyncStorageAdapter);
      if (!cancelled && cached) {
        setRoutes(cached);
      }

      const routes = await loadRouteCatalog();
      if (cancelled) return;

      setRoutes(routes);
      setRoutesLoading(false);

      if (routes.length < 50) {
        setRoutesError('No se pudieron cargar todas las rutas. Revisa tu conexión.');
      }

      await writeCachedRoutes(asyncStorageAdapter, routes);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [setRoutes, setRoutesError, setRoutesLoading]);
}
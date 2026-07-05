import {generateTrafficFallback} from '@rutas-morelia/transit-core';
import {useEffect, useState} from 'react';
import {LOCAL_API_BASE_URL} from '../lib/routes-config';

export function useTraffic(showTraffic: boolean, activeRouteGeoJSON: GeoJSON.FeatureCollection | null) {
  const [trafficGeoJSON, setTrafficGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function fetchTraffic() {
      try {
        const res = await fetch(`${LOCAL_API_BASE_URL}/v1/traffic`);
        if (res.ok) {
          const geojson = (await res.json()) as GeoJSON.FeatureCollection;
          if (geojson?.features?.length) {
            setTrafficGeoJSON(geojson);
            return;
          }
        }
      } catch {}

      setTrafficGeoJSON(generateTrafficFallback(activeRouteGeoJSON));
    }

    if (showTraffic) {
      void fetchTraffic();
      intervalId = setInterval(fetchTraffic, 30000);
    } else {
      setTrafficGeoJSON(null);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [showTraffic, activeRouteGeoJSON]);

  return trafficGeoJSON;
}
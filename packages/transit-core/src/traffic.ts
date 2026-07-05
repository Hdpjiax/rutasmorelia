import type {FeatureCollection} from 'geojson';

type TrafficLevel = 'low' | 'medium' | 'heavy';

const TRAFFIC_COLORS: Record<TrafficLevel, string> = {
  low: '#10b981',
  medium: '#f97316',
  heavy: '#ef4444',
};

export function generateTrafficFallback(routeGeoJSON: FeatureCollection | null): FeatureCollection {
  if (!routeGeoJSON?.features?.length) {
    return {type: 'FeatureCollection', features: []};
  }

  const features: FeatureCollection['features'] = [];
  const now = new Date();
  const hour = now.getHours();

  for (const routeFeature of routeGeoJSON.features) {
    const geometry = routeFeature.geometry;
    if (!geometry || (geometry.type !== 'LineString' && geometry.type !== 'MultiLineString')) {
      continue;
    }

    const routeId = String(routeFeature.properties?.id || 'default');
    const routeName = String(routeFeature.properties?.name || '');
    const coordinatesList = geometry.type === 'MultiLineString' ? geometry.coordinates : [geometry.coordinates];

    for (const coords of coordinatesList) {
      if (coords.length < 2) continue;

      for (let i = 0; i < coords.length - 1; i++) {
        const p1 = coords[i];
        const p2 = coords[i + 1];
        const coordSum = p1[0] + p1[1] + p2[0] + p2[1];
        const seed = Math.floor(Math.abs(Math.sin(coordSum) * 100000)) + now.getMinutes();

        let trafficLevel: TrafficLevel = 'low';
        let speed = 45;

        const isRushHour =
          (hour >= 8 && hour <= 9) || (hour >= 13 && hour <= 14) || (hour >= 18 && hour <= 19);
        const rand = seed % 100;

        if (isRushHour) {
          if (rand < 40) {
            trafficLevel = 'heavy';
            speed = 10 + (seed % 10);
          } else if (rand < 80) {
            trafficLevel = 'medium';
            speed = 22 + (seed % 8);
          } else {
            speed = 38 + (seed % 12);
          }
        } else if (rand < 10) {
          trafficLevel = 'heavy';
          speed = 12 + (seed % 8);
        } else if (rand < 30) {
          trafficLevel = 'medium';
          speed = 25 + (seed % 10);
        } else {
          speed = 42 + (seed % 15);
        }

        features.push({
          type: 'Feature',
          properties: {
            route_id: routeId,
            route_name: routeName,
            traffic_level: trafficLevel,
            traffic_color: TRAFFIC_COLORS[trafficLevel],
            speed_kmh: speed,
          },
          geometry: {type: 'LineString', coordinates: [p1, p2]},
        });
      }
    }
  }

  return {type: 'FeatureCollection', features};
}
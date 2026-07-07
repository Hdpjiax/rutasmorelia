import {GeoJSONSource, Layer} from '@maplibre/maplibre-react-native';
import type {FeatureCollection} from 'geojson';
import {sanitizeRouteLineGeojson} from '../../lib/map-geo';

type Props = {
  geojson: FeatureCollection | null;
};

export function WalkingPathLayers({geojson}: Props) {
  const data = sanitizeRouteLineGeojson(geojson);
  if (!data) return null;

  return (
    <GeoJSONSource id="walking-paths" data={data}>
      <Layer
        id="walking-lines"
        type="line"
        style={{
          lineColor: '#64748B',
          lineWidth: 3,
          lineDasharray: [1.5, 1.5],
          lineCap: 'round',
          lineJoin: 'round',
          lineOpacity: 0.85,
        }}
      />
    </GeoJSONSource>
  );
}
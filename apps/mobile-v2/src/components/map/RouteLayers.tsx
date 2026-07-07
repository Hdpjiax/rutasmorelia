import {GeoJSONSource, Layer} from '@maplibre/maplibre-react-native';
import type {FeatureCollection} from 'geojson';
import {sanitizeRouteLineGeojson} from '../../lib/map-geo';

type Props = {
  geojson: FeatureCollection | null;
  casingColor?: string;
  variant?: 'network' | 'active';
  sourceId?: string;
};

export function RouteLayers({
  geojson,
  casingColor = '#111827',
  variant = 'active',
  sourceId = 'active-route',
}: Props) {
  const data = sanitizeRouteLineGeojson(geojson);
  if (!data) return null;

  const isNetwork = variant === 'network';
  const lineOpacity = isNetwork ? 0.42 : 1;
  const casingOpacity = isNetwork ? 0.35 : 0.95;

  return (
    <GeoJSONSource id={sourceId} data={data}>
      <Layer
        id={`${sourceId}-casing`}
        type="line"
        style={{
          lineColor: ['coalesce', ['get', 'casingColor'], casingColor],
          lineWidth: ['interpolate', ['linear'], ['zoom'], 10, isNetwork ? 1.2 : 2.0, 14, isNetwork ? 2.0 : 3.4, 18, isNetwork ? 2.8 : 4.6],
          lineOpacity: casingOpacity,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      <Layer
        id={`${sourceId}-line`}
        type="line"
        style={{
          lineColor: ['coalesce', ['get', 'color'], '#00E5FF'],
          lineWidth: ['interpolate', ['linear'], ['zoom'], 10, isNetwork ? 0.6 : 1.0, 14, isNetwork ? 1.0 : 1.8, 18, isNetwork ? 1.6 : 2.8],
          lineOpacity: lineOpacity,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      {!isNetwork ? (
        <Layer
          id={`${sourceId}-arrows`}
          type="symbol"
          style={{
            symbolPlacement: 'line',
            symbolSpacing: ['interpolate', ['linear'], ['zoom'], 10, 48, 14, 72, 18, 96],
            iconImage: 'route-arrow-icon',
            iconSize: ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 0.72, 18, 0.95],
            iconRotationAlignment: 'map',
            iconAllowOverlap: true,
            iconIgnorePlacement: true,
            iconOpacity: 1,
          }}
        />
      ) : null}
    </GeoJSONSource>
  );
}
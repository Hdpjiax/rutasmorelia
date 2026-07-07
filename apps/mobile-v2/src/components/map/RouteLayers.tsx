import {GeoJSONSource, Images, Layer} from '@maplibre/maplibre-react-native';
import {EMPTY_GEOJSON} from '@rutas-morelia/transit-core';
import type {FeatureCollection} from 'geojson';

const ROUTE_ARROW_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAoElEQVR4nO3WwQmEMBAF0PhJA+akFaz9V6MV6MmUoLCwtw0mM3/Uw3zwojP8BxJICB6Pp5B++BzhhuAKYQ1BzZAlBC3DFhBIlpgQ1Azt6/x9LCBoGbaAQLLEhEACYEKgATAgYAA0kMgEpHH6+z5vS1faiU8VUwBJUawCJEKxCJCIxb90pQ8151hTrPoFmVAsAmRicRMgGxS/5k7o8YSncwLzh1hDCb69SgAAAABJRU5ErkJggg==';

type Props = {
  geojson: FeatureCollection | null;
  casingColor?: string;
};

export function RouteLayers({geojson, casingColor = '#1A2230'}: Props) {
  const data = geojson ?? EMPTY_GEOJSON;

  return (
    <>
      <Images images={{'route-arrow-icon': {source: {uri: ROUTE_ARROW_ICON}}}} />
      <GeoJSONSource id="active-route" data={data}>
        <Layer
          id="route-casing"
          type="line"
          style={{
            lineColor: ['coalesce', ['get', 'casingColor'], casingColor],
            lineWidth: 10,
            lineOpacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
        <Layer
          id="route-line"
          type="line"
          style={{
            lineColor: ['coalesce', ['get', 'color'], '#00E5FF'],
            lineWidth: 6,
            lineOpacity: 1,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
        <Layer
          id="route-arrows"
          type="symbol"
          style={{
            symbolPlacement: 'line',
            symbolSpacing: 90,
            iconImage: 'route-arrow-icon',
            iconSize: 0.55,
            iconRotationAlignment: 'map',
            iconAllowOverlap: true,
            iconOpacity: 0.85,
          }}
        />
      </GeoJSONSource>
    </>
  );
}
import {
  Camera,
  type CameraRef,
  Map as MapView,
  Marker,
  UserLocation,
  ViewAnnotation,
} from '@maplibre/maplibre-react-native';
import {MORELIA_CENTER, findClosestPointOnLine, type MapStyleJson} from '@rutas-morelia/transit-core';
import {useMemo} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useMapStyle} from '../../hooks/useMapStyle';
import {useRouteGeometry} from '../../hooks/useRouteGeometry';
import {useTransitStore} from '../../stores/transit.store';
import {useTheme} from '../../theme/ThemeProvider';
import {PulsingMarker} from './PulsingMarker';
import {RouteLayers} from './RouteLayers';

type Props = {
  cameraRef: React.RefObject<CameraRef | null>;
};

export function TransitMap({cameraRef}: Props) {
  const {mapStyle} = useMapStyle();
  const {theme} = useTheme();
  const origin = useTransitStore(s => s.origin);
  const destination = useTransitStore(s => s.destination);
  const {geojson} = useRouteGeometry(cameraRef);

  const boardingPoint = useMemo(() => {
    if (!geojson || !origin) return null;
    return findClosestPointOnLine(geojson, origin);
  }, [geojson, origin]);

  const alightingPoint = useMemo(() => {
    if (!geojson || !destination) return null;
    return findClosestPointOnLine(geojson, destination);
  }, [geojson, destination]);

  const styleProp = typeof mapStyle === 'string' ? mapStyle : (mapStyle as MapStyleJson);

  return (
    <View style={styles.fill}>
      <MapView style={styles.fill} mapStyle={styleProp as never} logo={false} attribution={false}>
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: [MORELIA_CENTER.longitude, MORELIA_CENTER.latitude],
            zoom: 13,
          }}
        />
        <UserLocation animated accuracy heading />
        <RouteLayers geojson={geojson} casingColor={theme.routeCasing} />
        {origin ? (
          <ViewAnnotation id="origin-marker" lngLat={[origin.longitude, origin.latitude]}>
            <PulsingMarker color={theme.accentAlt} size={12} />
          </ViewAnnotation>
        ) : null}
        {destination ? (
          <ViewAnnotation id="destination-marker" lngLat={[destination.longitude, destination.latitude]}>
            <PulsingMarker color={theme.accent} size={12} />
          </ViewAnnotation>
        ) : null}
        {boardingPoint ? (
          <Marker id="boarding-marker" lngLat={boardingPoint}>
            <View style={[styles.stopBadge, {backgroundColor: theme.accentAlt}]}>
              <Text style={styles.stopLabel}>Sube</Text>
            </View>
          </Marker>
        ) : null}
        {alightingPoint ? (
          <Marker id="alighting-marker" lngLat={alightingPoint}>
            <View style={[styles.stopBadge, {backgroundColor: theme.accent}]}>
              <Text style={styles.stopLabel}>Baja</Text>
            </View>
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  stopBadge: {paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#FFF'},
  stopLabel: {color: '#FFF', fontSize: 10, fontWeight: '700'},
});
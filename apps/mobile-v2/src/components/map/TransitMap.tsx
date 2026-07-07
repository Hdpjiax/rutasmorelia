import {
  Camera,
  type CameraRef,
  Images,
  Map as MapView,
  Marker,
  UserLocation,
} from '@maplibre/maplibre-react-native';
import {
  distanceMeters,
  findClosestPointOnLine,
  lngLatToCoords,
  MORELIA_CENTER,
  type MapStyleJson,
} from '@rutas-morelia/transit-core';
import {Footprints} from 'phosphor-react-native';
import {useMemo, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {buildWalkingPathsGeojson, isValidLngLat, sanitizeRouteLineGeojson} from '../../lib/map-geo';
import {ROUTE_ARROW_ICON_URI} from '../../lib/route-arrow-icon';
import {useJourneyRoutesGeometry} from '../../hooks/useJourneyRoutesGeometry';
import {useMapStyle} from '../../hooks/useMapStyle';
import {useRouteGeometry} from '../../hooks/useRouteGeometry';
import {useTransitStore} from '../../stores/transit.store';
import {useTheme} from '../../theme/ThemeProvider';
import {MapEndpointMarker} from './MapEndpointMarker';
import {RouteLayers} from './RouteLayers';
import {WalkingPathLayers} from './WalkingPathLayers';

type Props = {
  cameraRef: React.RefObject<CameraRef | null>;
};

export function TransitMap({cameraRef}: Props) {
  const {mapStyle} = useMapStyle();
  const {theme} = useTheme();
  const [mapReady, setMapReady] = useState(false);
  const origin = useTransitStore(s => s.origin);
  const destination = useTransitStore(s => s.destination);
  const activeRouteId = useTransitStore(s => s.activeRouteId);
  const {enabled: journeyMapEnabled, activeGeojson} = useJourneyRoutesGeometry(cameraRef);
  const {geojson: catalogRouteGeojson} = useRouteGeometry(cameraRef);

  const routeGeojson = useMemo(() => {
    if (journeyMapEnabled) return sanitizeRouteLineGeojson(activeGeojson);
    if (activeRouteId) return sanitizeRouteLineGeojson(catalogRouteGeojson);
    return null;
  }, [journeyMapEnabled, activeGeojson, activeRouteId, catalogRouteGeojson]);

  const boardingPoint = useMemo(() => {
    if (!routeGeojson || !origin) return null;
    const point = findClosestPointOnLine(routeGeojson, origin);
    return isValidLngLat(point) ? point : null;
  }, [routeGeojson, origin]);

  const alightingPoint = useMemo(() => {
    if (!routeGeojson || !destination) return null;
    const point = findClosestPointOnLine(routeGeojson, destination);
    return isValidLngLat(point) ? point : null;
  }, [routeGeojson, destination]);

  const walkingPaths = useMemo(
    () => buildWalkingPathsGeojson(origin, destination, boardingPoint, alightingPoint),
    [origin, destination, boardingPoint, alightingPoint],
  );

  const boardingWalkM = useMemo(() => {
    if (!origin || !boardingPoint) return null;
    return distanceMeters(origin, lngLatToCoords(boardingPoint));
  }, [origin, boardingPoint]);

  const alightingWalkM = useMemo(() => {
    if (!destination || !alightingPoint) return null;
    return distanceMeters(destination, lngLatToCoords(alightingPoint));
  }, [destination, alightingPoint]);

  const originLngLat = useMemo(
    () => (origin ? ([origin.longitude, origin.latitude] as [number, number]) : null),
    [origin],
  );
  const destinationLngLat = useMemo(
    () => (destination ? ([destination.longitude, destination.latitude] as [number, number]) : null),
    [destination],
  );

  const styleProp = typeof mapStyle === 'string' ? mapStyle : (mapStyle as MapStyleJson);
  const showAnnotations = mapReady;

  return (
    <View style={styles.fill}>
      <MapView
        style={styles.fill}
        mapStyle={styleProp as never}
        logo={false}
        attribution={false}
        onDidFinishLoadingMap={() => setMapReady(true)}>
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: [MORELIA_CENTER.longitude, MORELIA_CENTER.latitude],
            zoom: 13,
          }}
        />
        <UserLocation animated accuracy heading />
        <Images images={{'route-arrow-icon': {source: {uri: ROUTE_ARROW_ICON_URI}}}} />
        {routeGeojson ? <RouteLayers geojson={routeGeojson} variant="active" sourceId="active-route" /> : null}
        <WalkingPathLayers geojson={walkingPaths} />
        {showAnnotations && isValidLngLat(originLngLat) ? (
          <Marker id="origin-marker" lngLat={originLngLat} anchor="center">
            <MapEndpointMarker color={theme.accentAlt} />
          </Marker>
        ) : null}
        {showAnnotations && isValidLngLat(destinationLngLat) ? (
          <Marker id="destination-marker" lngLat={destinationLngLat} anchor="center">
            <MapEndpointMarker color={theme.accent} />
          </Marker>
        ) : null}
        {showAnnotations && boardingPoint ? (
          <Marker id="boarding-marker" lngLat={boardingPoint} anchor="bottom">
            <View collapsable={false} style={[styles.stopBadge, {backgroundColor: theme.accentAlt, borderColor: '#FFF'}]}>
              <Footprints size={12} color="#FFF" weight="fill" />
              <Text style={styles.stopLabel}>Sube aquí</Text>
              {boardingWalkM != null ? <Text style={styles.stopDistance}>{boardingWalkM} m caminando</Text> : null}
            </View>
          </Marker>
        ) : null}
        {showAnnotations && alightingPoint ? (
          <Marker id="alighting-marker" lngLat={alightingPoint} anchor="bottom">
            <View collapsable={false} style={[styles.stopBadge, {backgroundColor: theme.accent, borderColor: '#FFF'}]}>
              <Footprints size={12} color="#FFF" weight="fill" />
              <Text style={styles.stopLabel}>Baja aquí</Text>
              {alightingWalkM != null ? <Text style={styles.stopDistance}>{alightingWalkM} m al destino</Text> : null}
            </View>
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  stopBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    minWidth: 72,
    gap: 2,
  },
  stopLabel: {color: '#FFF', fontSize: 10, fontWeight: '800'},
  stopDistance: {color: '#FFF', fontSize: 9, fontWeight: '600', opacity: 0.92},
});
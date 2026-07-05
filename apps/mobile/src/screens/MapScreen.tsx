import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Images,
  Layer,
  Map as MapView,
  Marker,
  UserLocation,
  ViewAnnotation,
} from '@maplibre/maplibre-react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {Car, Crosshair, Trash} from 'phosphor-react-native';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {RootStackParamList} from '../../App';
import {PulsingMarker} from '../components/PulsingMarker';
import {RouteDrawer} from '../components/RouteDrawer';
import {SearchCard} from '../components/SearchCard';
import {TrafficLegend} from '../components/TrafficLegend';
import {useDrawerItems} from '../hooks/useDrawerItems';
import {useFavorites} from '../hooks/useFavorites';
import {useJourneySearch} from '../hooks/useJourneySearch';
import {useMapStyle} from '../hooks/useMapStyle';
import {usePlaceAutocomplete} from '../hooks/usePlaceAutocomplete';
import {useRouteCatalog} from '../hooks/useRouteCatalog';
import {useRouteGeometry} from '../hooks/useRouteGeometry';
import {useToast} from '../hooks/useToast';
import {useTraffic} from '../hooks/useTraffic';
import {
  DEFAULT_ORIGIN_LABEL,
  findClosestPointOnLine,
  isCombiRoute,
  isRouteFavorited as isRouteFavoritedCore,
  scoreRoutesByQuery,
  shouldShowFavoriteSuggestions,
} from '@rutas-morelia/transit-core';
import {useTransitStore} from '../store/transit-store';
import {dark, light} from '../theme';
import {EMPTY_GEOJSON, type DrawerItem, type Suggestion} from '../types/transit';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

const ROUTE_ARROW_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAoElEQVR4nO3WwQmEMBAF0PhJA+akFaz9V6MV6MmUoLCwtw0mM3/Uw3zwojP8BxJICB6Pp5B++BzhhuAKYQ1BzZAlBC3DFhBIlpgQ1Azt6/x9LCBoGbaAQLLEhEACYEKgATAgYAA0kMgEpHH6+z5vS1faiU8VUwBJUawCJEKxCJCIxb90pQ8151hTrPoFmVAsAmRicRMgGxS/5k7o8YSncwLzh1hDCb69SgAAAABJRU5ErkJggg==';

export function MapScreen({navigation}: Props) {
  const {colorScheme, mapStyle} = useMapStyle();
  const colors = colorScheme === 'dark' ? dark : light;
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraRef>(null);
  const originInputRef = useRef<TextInput>(null);
  const destinationInputRef = useRef<TextInput>(null);

  const {originLabel, destinationLabel, origin, destination, activeRouteId, setOrigin, setDestination, setActiveRouteId} =
    useTransitStore();

  const {message, toastKind, setMessage} = useToast();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeInput, setActiveInput] = useState<'origin' | 'destination' | null>(null);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [routeTransportFilter, setRouteTransportFilter] = useState<'combi' | 'camion'>('combi');
  const [routeSearchQuery, setRouteSearchQuery] = useState('');
  const [showTraffic, setShowTraffic] = useState(false);
  const [routeRequestVersion, setRouteRequestVersion] = useState(0);

  const routesList = useRouteCatalog();
  const {activeRouteGeoJSON, routeLoading, routeError, setActiveRouteGeoJSON} = useRouteGeometry({
    activeRouteId,
    routesList,
    colorScheme,
    camera,
    routeRequestVersion,
  });

  const {
    favorites,
    toggleFavoritePlace,
    toggleRouteFavorite,
    isPlaceFavorited,
    isRouteFavorited,
    favoriteSuggestions,
  } = useFavorites(setMessage);

  const {displayedSuggestions, loading: autocompleteLoading, clearSuggestions} = usePlaceAutocomplete({
    activeInput,
    originLabel,
    destinationLabel,
    origin,
    destination,
    favoriteSuggestions,
    favorites,
  });

  const browsingFavorites = shouldShowFavoriteSuggestions(
    activeInput,
    activeInput === 'origin' ? originLabel : destinationLabel,
  );
  const isMyLocationOrigin = originLabel === DEFAULT_ORIGIN_LABEL && origin != null;

  const {
    journeyOptions,
    journeyTab,
    setJourneyTab,
    loading: journeyLoading,
    planJourney,
    planJourneyWithCoords,
    selectSuggestion,
    locate,
    swapLocations,
    resetJourney,
    dismissSearchUi,
  } = useJourneySearch({
    originLabel,
    destinationLabel,
    origin,
    destination,
    setOrigin,
    setDestination,
    setActiveRouteId,
    setMessage,
    camera,
    favorites,
    originInputRef,
    destinationInputRef,
    displayedSuggestions,
    clearSuggestions,
    setActiveInput,
    setIsMenuOpen,
    activeInput,
  });

  const trafficGeoJSON = useTraffic(showTraffic, activeRouteGeoJSON);

  useEffect(() => {
    void locate();
    // Solo al montar: pedir ubicación inicial sin re-disparar en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showCatalogControls = journeyOptions.length === 0 || showOnlyFavorites;

  const visibleRoutes = useMemo(() => {
    let list = routesList;

    if (showOnlyFavorites) {
      list = list.filter(route => isRouteFavoritedCore(favorites, route.id));
    }

    if (showCatalogControls) {
      list = list.filter(route =>
        routeTransportFilter === 'combi' ? isCombiRoute(route) : !isCombiRoute(route),
      );
      const query = routeSearchQuery.trim();
      if (query) {
        list = scoreRoutesByQuery(list, query, 0.2);
      } else {
        list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'es-MX'));
      }
    }

    return list;
  }, [favorites, journeyOptions.length, routeSearchQuery, routeTransportFilter, routesList, showCatalogControls, showOnlyFavorites]);

  const drawerItems = useDrawerItems({
    visibleRoutes,
    journeyOptions,
    journeyTab,
    showOnlyFavorites,
    favorites,
    colorScheme,
  });

  const boardingCoord = useMemo(
    () => findClosestPointOnLine(activeRouteGeoJSON, origin),
    [activeRouteGeoJSON, origin],
  );
  const alightingCoord = useMemo(
    () => findClosestPointOnLine(activeRouteGeoJSON, destination),
    [activeRouteGeoJSON, destination],
  );

  const walkingPathsGeoJSON = useMemo(() => {
    if (!activeRouteGeoJSON || !origin || !destination || !boardingCoord || !alightingCoord) return null;
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: {type: 'origin-walk'},
          geometry: {
            type: 'LineString' as const,
            coordinates: [[origin.longitude, origin.latitude], boardingCoord],
          },
        },
        {
          type: 'Feature' as const,
          properties: {type: 'destination-walk'},
          geometry: {
            type: 'LineString' as const,
            coordinates: [alightingCoord, [destination.longitude, destination.latitude]],
          },
        },
      ],
    };
  }, [activeRouteGeoJSON, origin, destination, boardingCoord, alightingCoord]);

  const selectDrawerItem = useCallback(
    (item: DrawerItem) => {
      setActiveRouteId(item.id);
      setIsMenuOpen(false);
    },
    [setActiveRouteId],
  );

  const toggleSuggestionFavorite = useCallback(
    (suggestion: Suggestion) => {
      if (suggestion.latitude == null || suggestion.longitude == null) return;
      void toggleFavoritePlace(suggestion.label, {
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
      });
    },
    [toggleFavoritePlace],
  );

  const clearMap = useCallback(() => {
    setOrigin('', null);
    setDestination('', null);
    setActiveRouteId('');
    setActiveRouteGeoJSON(null);
    clearSuggestions();
    resetJourney();
    setMessage('Mapa limpio.', 'success');
  }, [clearSuggestions, resetJourney, setActiveRouteGeoJSON, setActiveRouteId, setDestination, setMessage, setOrigin]);

  const searchLoading = autocompleteLoading || journeyLoading;

  return (
    <View style={styles.root}>
      <MapView
        style={StyleSheet.absoluteFill}
        mapStyle={mapStyle}
        logo={false}
        compass
        touchRotate
        attribution
        accessibilityLabel="Mapa de transporte público de Morelia"
        onPress={() => dismissSearchUi()}
      >
        <Camera
          key="main-camera"
          ref={camera}
          initialViewState={{center: [-101.194, 19.702], zoom: 13.3}}
          minZoom={10}
          maxZoom={19}
        />
        {!origin ? <UserLocation key="user-location" animated accuracy heading /> : null}

        {isMyLocationOrigin ? (
          <ViewAnnotation
            key="my-location-marker"
            id="my-location-marker"
            lngLat={[origin.longitude, origin.latitude]}
          >
            <PulsingMarker color="#2563eb" variant="location" />
          </ViewAnnotation>
        ) : null}
        <Images key="route-arrow-images" images={{'route-arrow-icon': {source: {uri: ROUTE_ARROW_ICON}}}} />

        <GeoJSONSource key="routes" id="routes" data={activeRouteGeoJSON || EMPTY_GEOJSON}>
          <Layer
            key="route-lines-glow"
            id="route-lines-glow"
            type="line"
            style={{
              lineColor: ['get', 'color'],
              lineWidth: ['interpolate', ['linear'], ['zoom'], 10, 4.5, 14, 8.5, 18, 12.0],
              lineOpacity: colorScheme === 'dark' ? 0.22 : 0.45,
              lineCap: 'round',
              lineJoin: 'round',
              visibility: colorScheme === 'dark' ? 'visible' : 'none',
            }}
          />
          <Layer
            key="route-lines-shadow"
            id="route-lines-shadow"
            type="line"
            style={{
              lineColor: '#000000',
              lineWidth: ['interpolate', ['linear'], ['zoom'], 10, 3.0, 14, 5.0, 18, 7.0],
              lineOpacity: 0.12,
              lineCap: 'round',
              lineJoin: 'round',
              visibility: colorScheme === 'dark' ? 'none' : 'visible',
            }}
          />
          <Layer
            key="route-lines-casing"
            id="route-lines-casing"
            type="line"
            style={{
              lineColor: colorScheme === 'dark' ? '#3D4451' : '#FFFFFF',
              lineWidth: ['interpolate', ['linear'], ['zoom'], 10, 3.4, 14, 5.2, 18, 6.8],
              lineOpacity: colorScheme === 'dark' ? 0.75 : 1.0,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
          <Layer
            key="route-lines"
            id="route-lines"
            type="line"
            style={{
              lineColor: ['get', 'color'],
              lineWidth: ['interpolate', ['linear'], ['zoom'], 10, 2.2, 14, 3.4, 18, 4.6],
              lineOpacity: colorScheme === 'dark' ? 0.94 : 1.0,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
          <Layer
            key="route-arrows"
            id="route-arrows"
            type="symbol"
            style={{
              symbolPlacement: 'line',
              symbolSpacing: ['interpolate', ['linear'], ['zoom'], 10, 90, 14, 130, 18, 180],
              iconImage: 'route-arrow-icon',
              iconSize: ['interpolate', ['linear'], ['zoom'], 10, 0.45, 14, 0.65, 18, 0.85],
              iconRotationAlignment: 'map',
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
            }}
          />
        </GeoJSONSource>

        <GeoJSONSource key="traffic" id="traffic" data={trafficGeoJSON || EMPTY_GEOJSON}>
          <Layer
            key="traffic-lines"
            id="traffic-lines"
            type="line"
            filter={['==', ['to-string', ['get', 'route_id']], String(activeRouteId)]}
            style={{
              lineColor: ['get', 'traffic_color'],
              lineWidth: ['interpolate', ['linear'], ['zoom'], 10, 1.2, 14, 2.2, 18, 3.2],
              lineOpacity: 0.85,
              lineCap: 'round',
              lineJoin: 'round',
              visibility: showTraffic ? 'visible' : 'none',
            }}
          />
        </GeoJSONSource>

        <GeoJSONSource key="stops" id="stops" data={EMPTY_GEOJSON}>
          <Layer
            key="stops-layer"
            id="stops-layer"
            type="circle"
            style={{
              circleRadius: 7,
              circleColor: colors.primary,
              circleStrokeColor: '#FFFFFF',
              circleStrokeWidth: 3,
            }}
          />
        </GeoJSONSource>

        <GeoJSONSource key="walking-paths" id="walking-paths" data={walkingPathsGeoJSON || EMPTY_GEOJSON}>
          <Layer
            key="walking-lines"
            id="walking-lines"
            type="line"
            style={{
              lineColor: colorScheme === 'dark' ? '#94A3B8' : '#64748B',
              lineWidth: 3,
              lineDasharray: [2, 2],
              lineCap: 'round',
              lineJoin: 'round',
              visibility: walkingPathsGeoJSON ? 'visible' : 'none',
            }}
          />
        </GeoJSONSource>

        {boardingCoord ? (
          <Marker key="boarding-stop-marker" id="boarding-stop-marker" lngLat={boardingCoord}>
            <View style={styles.stopMarkerGreen}>
              <Text style={styles.stopMarkerText}>📥 Sube aquí</Text>
            </View>
          </Marker>
        ) : null}

        {alightingCoord ? (
          <Marker key="alighting-stop-marker" id="alighting-stop-marker" lngLat={alightingCoord}>
            <View style={styles.stopMarkerRed}>
              <Text style={styles.stopMarkerText}>🏁 Baja aquí</Text>
            </View>
          </Marker>
        ) : null}

        {origin && !isMyLocationOrigin ? (
          <ViewAnnotation
            key="origin-marker"
            id="origin-marker"
            lngLat={[origin.longitude, origin.latitude]}
            draggable
            onDragEnd={e => {
              const coords = e.nativeEvent.lngLat;
              if (coords?.length >= 2) {
                const newCoords = {latitude: coords[1], longitude: coords[0]};
                setOrigin('Ubicación en el mapa', newCoords);
                if (destination) void planJourneyWithCoords(newCoords, destination);
              }
            }}
          >
            <PulsingMarker color="#2563eb" />
          </ViewAnnotation>
        ) : null}

        {destination ? (
          <ViewAnnotation
            key="destination-marker"
            id="destination-marker"
            lngLat={[destination.longitude, destination.latitude]}
            draggable
            onDragEnd={e => {
              const coords = e.nativeEvent.lngLat;
              if (coords?.length >= 2) {
                const newCoords = {latitude: coords[1], longitude: coords[0]};
                setDestination('Ubicación en el mapa', newCoords);
                if (origin) void planJourneyWithCoords(origin, newCoords);
              }
            }}
          >
            <PulsingMarker color="#ef4444" />
          </ViewAnnotation>
        ) : null}
      </MapView>

      <View pointerEvents="box-none" style={[styles.overlay, {paddingTop: insets.top + 4}]}>
        {!isMenuOpen ? (
          <SearchCard
            colorScheme={colorScheme}
            top={insets.top + 8}
            originLabel={originLabel}
            destinationLabel={destinationLabel}
            origin={origin}
            destination={destination}
            isOriginFavorited={isPlaceFavorited(originLabel)}
            isDestinationFavorited={isPlaceFavorited(destinationLabel)}
            isPlaceFavorited={isPlaceFavorited}
            displayedSuggestions={displayedSuggestions}
            activeInput={activeInput}
            browsingFavorites={browsingFavorites}
            loading={searchLoading}
            originInputRef={originInputRef}
            destinationInputRef={destinationInputRef}
            onOpenMenu={() => setIsMenuOpen(true)}
            onOriginChange={value => {
              setOrigin(value, value === DEFAULT_ORIGIN_LABEL ? origin : null);
              setActiveInput('origin');
            }}
            onDestinationChange={value => {
              setDestination(value, null);
              setActiveInput('destination');
            }}
            onOriginFocus={() => setActiveInput('origin')}
            onDestinationFocus={() => setActiveInput('destination')}
            onLocate={() => void locate()}
            onSwap={swapLocations}
            onToggleOriginFavorite={() => void toggleFavoritePlace(originLabel, origin)}
            onToggleDestinationFavorite={() => void toggleFavoritePlace(destinationLabel, destination)}
            onToggleSuggestionFavorite={toggleSuggestionFavorite}
            onSelectSuggestion={suggestion => void selectSuggestion(suggestion)}
            onSearch={() => void planJourney()}
          />
        ) : null}

        {!isMenuOpen && (routeLoading || routeError) ? (
          <Pressable
            accessibilityRole={routeError ? 'button' : 'progressbar'}
            accessibilityLabel={routeError || 'Cargando recorrido'}
            disabled={!routeError}
            onPress={() => setRouteRequestVersion(v => v + 1)}
            style={[
              styles.routeStatus,
              {top: insets.top + 112, backgroundColor: colors.bg, borderColor: routeError ? colors.primary : colors.line},
            ]}
          >
            {routeLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.routeStatusIcon, {color: colors.primary}]}>!</Text>
            )}
            <Text numberOfLines={2} style={[styles.routeStatusText, {color: colors.ink}]}>
              {routeError || 'Cargando recorrido…'}
            </Text>
          </Pressable>
        ) : null}

        <View style={[styles.mapActions, {top: insets.top + 112}]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Centrar en mi ubicación"
            onPress={() => void locate()}
            style={[styles.floatingButton, {backgroundColor: colors.bg, borderColor: colors.line, marginBottom: 8}]}
          >
            <Crosshair size={22} color={colors.ink} weight="bold" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mostrar tráfico"
            onPress={() => setShowTraffic(prev => !prev)}
            style={[
              styles.floatingButton,
              {
                backgroundColor: showTraffic ? colors.primarySoft : colors.bg,
                borderColor: showTraffic ? colors.primary : colors.line,
                marginBottom: 8,
              },
            ]}
          >
            <Car size={22} color={showTraffic ? colors.primary : colors.ink} weight={showTraffic ? 'fill' : 'regular'} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Limpiar mapa"
            onPress={clearMap}
            style={[styles.floatingButton, {backgroundColor: colors.bg, borderColor: colors.line}]}
          >
            <Trash size={22} color={colors.ink} />
          </Pressable>
        </View>

        {showTraffic ? <TrafficLegend colorScheme={colorScheme} bottom={Math.max(insets.bottom, 16)} /> : null}
      </View>

      <RouteDrawer
        visible={isMenuOpen}
        colorScheme={colorScheme}
        insets={insets}
        loading={journeyLoading}
        journeyOptions={journeyOptions}
        journeyTab={journeyTab}
        showOnlyFavorites={showOnlyFavorites}
        showCatalogControls={showCatalogControls}
        routeTransportFilter={routeTransportFilter}
        routeSearchQuery={routeSearchQuery}
        drawerItems={drawerItems}
        activeRouteId={activeRouteId}
        isRouteFavorited={isRouteFavorited}
        onClose={() => setIsMenuOpen(false)}
        onNavigateAccount={() => {
          setIsMenuOpen(false);
          navigation.navigate('Account');
        }}
        onToggleFavoritesFilter={() => setShowOnlyFavorites(prev => !prev)}
        onRouteTransportFilterChange={setRouteTransportFilter}
        onRouteSearchQueryChange={setRouteSearchQuery}
        onJourneyTabChange={setJourneyTab}
        onSelectItem={selectDrawerItem}
        onToggleRouteFavorite={routeId => void toggleRouteFavorite(routeId)}
      />

      {message ? (
        <View
          style={[
            styles.toastContainer,
            {
              backgroundColor:
                toastKind === 'error'
                  ? colorScheme === 'dark'
                    ? '#4A2C2C'
                    : '#FEE2E2'
                  : toastKind === 'success'
                    ? colorScheme === 'dark'
                      ? '#2C3D2A'
                      : '#ECFCCB'
                    : colors.surfaceStrong,
              borderColor:
                toastKind === 'error' ? '#F87171' : toastKind === 'success' ? colors.primary : colors.line,
              bottom: insets.bottom + 16,
            },
          ]}
        >
          <Text
            style={[
              styles.toastText,
              {
                color:
                  toastKind === 'error'
                    ? colorScheme === 'dark'
                      ? '#FECACA'
                      : '#991B1B'
                    : colors.ink,
              },
            ]}
          >
            {message}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  overlay: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0},
  mapActions: {position: 'absolute', right: 12, gap: 8},
  floatingButton: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeStatus: {
    position: 'absolute',
    left: 12,
    right: 70,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    elevation: 4,
  },
  routeStatusIcon: {fontSize: 16, fontWeight: '800'},
  routeStatusText: {flex: 1, fontSize: 12, fontWeight: '600'},
  stopMarkerGreen: {
    backgroundColor: '#10B981',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: {width: 0, height: 3},
    elevation: 12,
    zIndex: 999,
  },
  stopMarkerRed: {
    backgroundColor: '#EF4444',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: {width: 0, height: 3},
    elevation: 12,
    zIndex: 999,
  },
  stopMarkerText: {color: '#FFFFFF', fontSize: 11, fontWeight: 'bold'},
  toastContainer: {
    position: 'absolute',
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 8,
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '90%',
    minWidth: '55%',
    zIndex: 9999,
  },
  toastText: {flex: 1, fontSize: 14, fontWeight: '600', textAlign: 'center', lineHeight: 19},
});
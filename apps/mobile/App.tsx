import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map as MapView,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowRight,
  ArrowsDownUp,
  Bus,
  Crosshair,
  Heart,
  List,
  MagnifyingGlass,
  MapPin,
  NavigationArrow,
} from 'phosphor-react-native';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { supabase } from './supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Coordinates = { latitude: number; longitude: number };
type TransitSuggestion = {
  entity_type: 'route' | 'stop' | 'place';
  entity_id: number;
  label: string;
  subtitle: string | null;
  latitude: number | null;
  longitude: number | null;
};

const LIGHT = {
  bg: '#ffffff',
  surface: '#f4f5ef',
  surfaceStrong: '#e8eadf',
  ink: '#25271f',
  muted: '#626657',
  line: '#d9dccf',
  primary: '#6f7e24',
  primarySoft: '#edf2d5',
  white: '#ffffff',
  accent: '#c9542d',
};

const DARK = {
  bg: '#181914',
  surface: '#22241d',
  surfaceStrong: '#303329',
  ink: '#f3f4ed',
  muted: '#b5b9aa',
  line: '#424538',
  primary: '#b3c456',
  primarySoft: '#343a20',
  white: '#ffffff',
  accent: '#e2724a',
};

export default function App() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? DARK : LIGHT;
  const camera = useRef<CameraRef>(null);

  const [origin, setOrigin] = useState('Mi ubicación');
  const [destination, setDestination] = useState('');
  const [activeRoute, setActiveRoute] = useState<string | null>(null);
  const [tab, setTab] = useState<'routes' | 'stops'>('routes');
  const [message, setMessage] = useState('Servicio activo');

  // Coordinates
  const [originCoordinates, setOriginCoordinates] = useState<Coordinates | null>(null);
  const [destinationCoordinates, setDestinationCoordinates] = useState<Coordinates | null>(null);

  // Supabase states
  const [routes, setRoutes] = useState<any[]>([]);
  const [routeCollection, setRouteCollection] = useState<GeoJSON.FeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  });
  const [suggestions, setSuggestions] = useState<TransitSuggestion[]>([]);
  const [journeyOptions, setJourneyOptions] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(true);
  const [isSearchingJourney, setIsSearchingJourney] = useState(false);

  // Fetch real routes
  useEffect(() => {
    async function fetchRoutes() {
      setIsLoadingRoutes(true);
      const { data, error } = await supabase
        .from('routes')
        .select('id, name, code, color, transport_type, description')
        .eq('is_active', true)
        .eq('validation_status', 'validated')
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching routes from mobile:', error);
        setIsLoadingRoutes(false);
        return;
      }

      if (data && data.length > 0) {
        const mapped = data.map((r: any) => {
          let num = r.transport_type === 'combi' ? 'C' : 'A';
          const match = r.code.match(/\d+/);
          if (match) num += match[0];

          return {
            id: String(r.id),
            number: num,
            name: r.name,
            detail: r.description || (r.transport_type === 'combi' ? 'Ruta de combi' : 'Ruta de autobús'),
            color: r.color || '#6f7e24',
            time: r.transport_type === 'combi' ? 'Combi' : 'Camión',
          };
        });
        setRoutes(mapped);
        setActiveRoute(mapped[0].id);
      }
      setIsLoadingRoutes(false);
    }
    fetchRoutes();
  }, []);

  // Fetch active route geometry variant
  useEffect(() => {
    if (!activeRoute) return;

    async function loadGeometry() {
      const { data, error } = await supabase
        .from('route_variants')
        .select('geometry, route_id, routes(color)')
        .eq('route_id', activeRoute)
        .eq('is_active', true)
        .limit(1);

      if (error) {
        console.error('Error loading geometry in mobile app:', error);
        return;
      }

      if (data && data.length > 0 && data[0].geometry) {
        const variant = data[0];
        const routeColor = (variant.routes as any)?.color || '#6f7e24';

        const geojson: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { id: String(activeRoute), color: routeColor },
              geometry: variant.geometry as any,
            },
          ],
        };
        setRouteCollection(geojson);

        // Fly to route coordinates bounds
        if (variant.geometry && (variant.geometry as any).coordinates) {
          const coords = (variant.geometry as any).coordinates;
          if (coords.length > 0) {
            // Flatten if MultiLineString
            const flatCoords = (variant.geometry as any).type === 'MultiLineString' 
              ? coords.flat(1) 
              : coords;
              
            if (flatCoords.length > 0) {
              const lons = flatCoords.map((c: any) => c[0]);
              const lats = flatCoords.map((c: any) => c[1]);
              const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2;
              const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
              camera.current?.flyTo({
                center: [centerLon, centerLat],
                zoom: 12.8,
                duration: 600,
              });
            }
          }
        }
      }
    }
    loadGeometry();
  }, [activeRoute]);

  // Load favorites
  useEffect(() => {
    async function loadFavorites() {
      try {
        const saved = await AsyncStorage.getItem('simum-favorites');
        if (saved) {
          setFavorites(JSON.parse(saved));
        }
      } catch (err) {
        console.error('Error loading favorites:', err);
      }
    }
    loadFavorites();
  }, []);

  // Toggle favorite
  async function toggleFavorite(routeId: string) {
    let next: string[];
    if (favorites.includes(routeId)) {
      next = favorites.filter((id) => id !== routeId);
      setMessage('Ruta eliminada de favoritos');
    } else {
      next = [...favorites, routeId];
      setMessage('Ruta agregada a favoritos');
    }
    setFavorites(next);
    await AsyncStorage.setItem('simum-favorites', JSON.stringify(next));
  }

  // Filter routes by search query
  const visibleRoutes = useMemo(() => {
    const query = destination.trim().toLocaleLowerCase('es-MX');
    if (!query) return routes;
    return routes.filter((route) => `${route.name} ${route.detail}`.toLocaleLowerCase('es-MX').includes(query));
  }, [destination, routes]);

  async function locateUser() {
    setMessage('Buscando tu ubicación…');
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setMessage('Activa el permiso de ubicación para centrar el mapa.');
      return;
    }
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    camera.current?.flyTo({
      center: [current.coords.longitude, current.coords.latitude],
      zoom: 15.2,
      duration: 700,
    });
    setOrigin('Mi ubicación');
    setOriginCoordinates({
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
    });
    setMessage('Ubicación actualizada');
  }

  function swapLocations() {
    setOrigin(destination || 'Centro Histórico');
    setDestination(origin === 'Mi ubicación' ? '' : origin);
    setOriginCoordinates(destinationCoordinates);
    setDestinationCoordinates(null);
    setSuggestions([]);
  }

  // Smart Search suggestions autocompletado
  async function updateDestination(value: string) {
    setDestination(value);
    setDestinationCoordinates(null);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setJourneyOptions([]);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('search-transit', {
        body: { query: value, limit: 5 },
      });
      if (!error && data?.data) {
        setSuggestions(data.data as TransitSuggestion[]);
      }
    } catch (e) {
      console.error(e);
    }
  }

  function selectSuggestion(suggestion: TransitSuggestion) {
    setDestination(suggestion.label);
    setDestinationCoordinates(
      suggestion.latitude !== null && suggestion.longitude !== null
        ? { latitude: suggestion.latitude, longitude: suggestion.longitude }
        : null
    );
    setSuggestions([]);
    if (suggestion.entity_type === 'route') {
      setActiveRoute(String(suggestion.entity_id));
    }
  }

  // Journey planning motor
  async function planJourney() {
    if (!destination.trim()) {
      setMessage('Ingresa un destino para calcular tu viaje.');
      return;
    }
    setJourneyOptions([]);
    setIsSearchingJourney(true);
    setMessage('Buscando opciones de trayecto…');

    let origCoords = originCoordinates;
    let destCoords = destinationCoordinates;
    
    if (!origCoords || !destCoords) {
      origCoords = origCoords || { latitude: 19.7027, longitude: -101.1925 };
      destCoords = destCoords || { latitude: 19.6917, longitude: -101.1685 };
    }

    try {
      const { data, error } = await supabase.functions.invoke('plan-journey', {
        body: { origin: origCoords, destination: destCoords },
      });

      if (error) {
        console.error(error);
        setMessage('Error al calcular trayectos.');
        setIsSearchingJourney(false);
        return;
      }

      const options = data?.data as any[] | undefined;
      if (options && options.length > 0) {
        setJourneyOptions(options);
        setMessage(`${options.length} opciones calculadas.`);
        setActiveRoute(String(options[0].route_id));
      } else {
        setMessage('No encontramos conexión directa.');
      }
    } catch (e) {
      console.error(e);
      setMessage('Error de conexión.');
    }
    setIsSearchingJourney(false);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <MapView
        style={StyleSheet.absoluteFill}
        mapStyle={scheme === 'dark' 
          ? "https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png"
          : "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
        }
        logo={false}
        attribution
        compass={false}
        accessibilityLabel="Mapa de rutas de transporte público en Morelia"
      >
        <Camera
          ref={camera}
          initialViewState={{ center: [-101.194, 19.702], zoom: 13.3 }}
          maxZoom={19}
          minZoom={10}
        />
        {routeCollection.features.length > 0 && (
          <GeoJSONSource id="routes" data={routeCollection}>
            <Layer
              id="route-lines-glow"
              type="line"
              paint={{
                'line-color': ['get', 'color'],
                'line-width': 4.5,
                'line-opacity': 0.35,
              }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
            <Layer
              id="route-lines"
              type="line"
              paint={{
                'line-color': ['get', 'color'],
                'line-width': 2.2,
                'line-opacity': 0.95,
              }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </GeoJSONSource>
        )}
      </MapView>

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={[styles.topbar, { backgroundColor: colors.bg, borderColor: colors.line }]}>
          <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
            <Bus size={22} color={colors.white} weight="fill" />
          </View>
          <View style={styles.brandCopy}>
            <Text style={[styles.brandTitle, { color: colors.ink }]}>SIMUM Móvil</Text>
            <Text style={[styles.brandSubtitle, { color: colors.muted }]}>Muévete con claridad</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver rutas favoritas"
            onPress={() => {
              if (favorites.length > 0) {
                setMessage(`Tienes ${favorites.length} favoritas. Clickea para alternar.`);
              } else {
                setMessage('No has guardado favoritas aún.');
              }
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.bg, borderColor: colors.line }, pressed && styles.pressed]}
          >
            <Heart size={21} color={favorites.length > 0 ? colors.accent : colors.ink} weight={favorites.length > 0 ? 'fill' : 'regular'} />
          </Pressable>
        </View>

        <View style={styles.mapActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Centrar en mi ubicación"
            onPress={locateUser}
            style={({ pressed }) => [styles.floatingButton, { backgroundColor: colors.bg, borderColor: colors.line }, pressed && styles.pressed]}
          >
            <Crosshair size={22} color={colors.ink} weight="bold" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mostrar todas las rutas"
            onPress={() => setMessage('Mostrando las 106 rutas de Morelia')}
            style={({ pressed }) => [styles.floatingButton, { backgroundColor: colors.bg, borderColor: colors.line }, pressed && styles.pressed]}
          >
            <List size={22} color={colors.ink} />
          </Pressable>
        </View>

        <KeyboardAvoidingView style={styles.sheetPosition} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { backgroundColor: colors.bg, borderColor: colors.line }]}>
            <View style={[styles.handle, { backgroundColor: colors.line }]} />
            <View style={styles.sheetHeader}>
              <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>¿A dónde vas?</Text>
              <View style={[styles.status, { backgroundColor: colors.primarySoft }]}>
                <View style={[styles.statusDot, { backgroundColor: colors.primary }]} />
                <Text numberOfLines={1} style={[styles.statusText, { color: colors.primary }]}>{message}</Text>
              </View>
            </View>

            <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <Crosshair size={19} color={colors.muted} />
              <TextInput
                accessibilityLabel="Origen"
                style={[styles.input, { color: colors.ink }]}
                placeholderTextColor={colors.muted}
                value={origin}
                onChangeText={setOrigin}
              />
              <Pressable accessibilityRole="button" accessibilityLabel="Usar mi ubicación" onPress={locateUser} hitSlop={8}>
                <NavigationArrow size={19} color={colors.muted} />
              </Pressable>
            </View>

            <View style={[styles.inputRow, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <MapPin size={19} color={colors.muted} />
              <TextInput
                accessibilityLabel="Destino"
                style={[styles.input, { color: colors.ink }]}
                placeholder="Busca un lugar o colonia"
                placeholderTextColor={colors.muted}
                value={destination}
                onChangeText={updateDestination}
                returnKeyType="search"
                onSubmitEditing={planJourney}
              />
              <Pressable accessibilityRole="button" accessibilityLabel="Intercambiar origen y destino" onPress={swapLocations} hitSlop={8}>
                <ArrowsDownUp size={19} color={colors.muted} />
              </Pressable>
            </View>

            {/* Suggestions list dropdown */}
            {suggestions.length > 0 && (
              <View style={[styles.suggestionsDropdown, { backgroundColor: colors.bg, borderColor: colors.line }]}>
                {suggestions.map((suggestion) => (
                  <Pressable
                    key={`${suggestion.entity_type}-${suggestion.entity_id}`}
                    onPress={() => selectSuggestion(suggestion)}
                    style={styles.suggestionRow}
                  >
                    <MapPin size={16} color={colors.muted} />
                    <View style={styles.suggestionText}>
                      <Text style={{ color: colors.ink, fontWeight: 'bold', fontSize: 13 }}>{suggestion.label}</Text>
                      <Text style={{ color: colors.muted, fontSize: 11 }}>{suggestion.subtitle || 'Morelia, Michoacán'}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              onPress={planJourney}
              style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}
            >
              {isSearchingJourney ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <MagnifyingGlass size={20} color={colors.white} weight="bold" />
              )}
              <Text style={styles.primaryButtonText}>Buscar ruta</Text>
            </Pressable>

            <View style={[styles.tabs, { backgroundColor: colors.surface }]} accessibilityRole="tablist">
              {(['routes', 'stops'] as const).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === value }}
                  onPress={() => setTab(value)}
                  style={[styles.tab, tab === value && { backgroundColor: colors.bg }]}
                >
                  <Text style={[styles.tabText, { color: tab === value ? colors.ink : colors.muted }]}>
                    {value === 'routes' ? 'Rutas cercanas' : 'Paradas'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <ScrollView style={styles.results} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {isLoadingRoutes ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 18 }} />
              ) : tab === 'routes' ? (
                journeyOptions.length > 0 ? (
                  journeyOptions.map((option, idx) => (
                    <Pressable
                      key={`${option.route_id}-${idx}`}
                      accessibilityRole="button"
                      onPress={() => setActiveRoute(String(option.route_id))}
                      style={({ pressed }) => [styles.routeRow, activeRoute === String(option.route_id) && { backgroundColor: colors.surface }, pressed && styles.pressed]}
                    >
                      <View style={[styles.routeNumber, { backgroundColor: option.route_color || colors.primary }]}>
                        <Text style={styles.routeNumberText}>
                          {option.route_code ? (option.route_code.split('_')[1] || option.route_code[0]) : 'R'}
                        </Text>
                      </View>
                      <View style={styles.routeCopy}>
                        <Text numberOfLines={1} style={[styles.routeName, { color: colors.ink }]}>{option.route_name}</Text>
                        <Text numberOfLines={1} style={[styles.routeDetail, { color: colors.muted }]}>
                          Subir: {option.boarding_stop_name || 'Parada cercana'}
                        </Text>
                      </View>
                      <Text style={[styles.routeTime, { color: colors.muted }]}>{option.estimatedMinutes} min</Text>
                    </Pressable>
                  ))
                ) : visibleRoutes.map((route) => (
                  <Pressable
                    key={route.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: activeRoute === route.id }}
                    onPress={() => setActiveRoute(route.id)}
                    style={({ pressed }) => [styles.routeRow, activeRoute === route.id && { backgroundColor: colors.surface }, pressed && styles.pressed]}
                  >
                    <View style={[styles.routeNumber, { backgroundColor: route.color }]}>
                      <Text style={styles.routeNumberText}>{route.number}</Text>
                    </View>
                    <View style={styles.routeCopy}>
                      <Text numberOfLines={1} style={[styles.routeName, { color: colors.ink }]}>{route.name}</Text>
                      <Text numberOfLines={1} style={[styles.routeDetail, { color: colors.muted }]}>{route.detail}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={[styles.routeTime, { color: colors.muted }]}>{route.time}</Text>
                      <Pressable hitSlop={6} onPress={() => toggleFavorite(route.id)}>
                        <Heart size={16} color={favorites.includes(route.id) ? colors.accent : colors.muted} weight={favorites.includes(route.id) ? 'fill' : 'regular'} />
                      </Pressable>
                    </View>
                  </Pressable>
                ))
              ) : (
                ['Catedral', 'Mercado Independencia', 'Las Tarascas'].map((name, index) => (
                  <Pressable key={name} accessibilityRole="button" style={({ pressed }) => [styles.routeRow, pressed && styles.pressed]}>
                    <View style={[styles.routeNumber, { backgroundColor: colors.primary }]}><MapPin size={18} color={colors.white} weight="fill" /></View>
                    <View style={styles.routeCopy}>
                      <Text style={[styles.routeName, { color: colors.ink }]}>{name}</Text>
                      <Text style={[styles.routeDetail, { color: colors.muted }]}>A {3 + index * 3} min caminando</Text>
                    </View>
                    <ArrowRight size={18} color={colors.muted} />
                  </Pressable>
                ))
              )}
              {tab === 'routes' && visibleRoutes.length === 0 && !isLoadingRoutes && (
                <Text style={[styles.empty, { color: colors.muted }]}>No encontramos rutas. Prueba con una colonia o punto conocido.</Text>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'space-between' },
  topbar: { minHeight: 64, marginHorizontal: 12, marginTop: 4, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16 },
  brandMark: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  brandCopy: { flex: 1 },
  brandTitle: { fontSize: 16, lineHeight: 19, fontWeight: '700', letterSpacing: -0.3 },
  brandSubtitle: { fontSize: 12, lineHeight: 16 },
  iconButton: { width: 44, height: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  mapActions: { position: 'absolute', top: 78, right: 12, gap: 8 },
  floatingButton: { width: 46, height: 46, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sheetPosition: { width: '100%', maxHeight: '66%' },
  sheet: { marginHorizontal: 8, marginBottom: 8, paddingHorizontal: 16, paddingBottom: 12, borderWidth: 1, borderRadius: 16, shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 8, marginBottom: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  title: { flex: 1, fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -0.6 },
  status: { maxWidth: '50%', minHeight: 28, paddingHorizontal: 9, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { flexShrink: 1, fontSize: 11, fontWeight: '700' },
  inputRow: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, minHeight: 46, fontSize: 15 },
  primaryButton: { minHeight: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  tabs: { height: 46, borderRadius: 12, padding: 4, flexDirection: 'row', marginTop: 12, marginBottom: 4 },
  tab: { flex: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 13, fontWeight: '700' },
  results: { maxHeight: 154 },
  routeRow: { minHeight: 68, borderRadius: 12, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 11 },
  routeNumber: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  routeNumberText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  routeCopy: { flex: 1, minWidth: 0 },
  routeName: { fontSize: 14, lineHeight: 18, fontWeight: '700' },
  routeDetail: { marginTop: 3, fontSize: 12, lineHeight: 15 },
  routeTime: { fontSize: 12, fontWeight: '600' },
  empty: { paddingVertical: 18, paddingHorizontal: 12, textAlign: 'center', fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  suggestionsDropdown: { position: 'absolute', top: 120, left: 16, right: 16, zIndex: 10, borderRadius: 12, borderWidth: 1, padding: 4, maxHeight: 180, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 4 },
  suggestionRow: { padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  suggestionText: { flex: 1 },
});

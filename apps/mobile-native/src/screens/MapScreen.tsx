import {useEffect, useMemo, useRef, useState} from 'react';
import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map as MapView,
} from '@maplibre/maplibre-react-native';
import Geolocation from '@react-native-community/geolocation';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {PERMISSIONS, request, RESULTS} from 'react-native-permissions';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {
  ArrowsDownUp, Bus, Crosshair, Heart, List, MagnifyingGlass,
  MapPin, NavigationArrow, UserCircle,
} from 'phosphor-react-native';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet,
  Text, TextInput, useColorScheme, View,
} from 'react-native';
import type {RootStackParamList} from '../../App';
import {supabase} from '../lib/supabase';
import {useTransitStore} from '../store/transit-store';
import {dark, light} from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;
type Suggestion = {entity_type: string; entity_id: number; label: string; subtitle: string | null; latitude: number | null; longitude: number | null};

const ROUTES = [
  {id: '1', number: '1', name: 'Centro · Tarímbaro', detail: 'Por Av. Madero', time: '8 min', color: '#6F7E24'},
  {id: '2', number: '2', name: 'CU · Las Américas', detail: 'Por Camelinas', time: '12 min', color: '#C9542D'},
  {id: '3', number: '3', name: 'Villas · Centro', detail: 'Por Acueducto', time: '15 min', color: '#347B8F'},
];

const routesGeoJson: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {type: 'Feature', properties: {id: '1', color: '#6F7E24'}, geometry: {type: 'LineString', coordinates: [[-101.215, 19.704], [-101.207, 19.701], [-101.198, 19.7], [-101.191, 19.703], [-101.183, 19.708], [-101.176, 19.713]]}},
    {type: 'Feature', properties: {id: '2', color: '#C9542D'}, geometry: {type: 'LineString', coordinates: [[-101.205, 19.718], [-101.201, 19.711], [-101.198, 19.703], [-101.194, 19.695], [-101.189, 19.688]]}},
    {type: 'Feature', properties: {id: '3', color: '#347B8F'}, geometry: {type: 'LineString', coordinates: [[-101.225, 19.692], [-101.214, 19.695], [-101.202, 19.699], [-101.191, 19.703], [-101.181, 19.698]]}},
  ],
};

const stopsGeoJson: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [[-101.1925, 19.7027], [-101.2014, 19.7002], [-101.1854, 19.7054], [-101.225, 19.692]].map((coordinates, index) => ({
    type: 'Feature', properties: {id: index + 1}, geometry: {type: 'Point', coordinates},
  })),
};

export function MapScreen({navigation}: Props) {
  const colors = useColorScheme() === 'dark' ? dark : light;
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraRef>(null);
  const {
    originLabel, destinationLabel, origin, destination, activeRouteId,
    setOrigin, setDestination, setActiveRouteId,
  } = useTransitStore();
  const [tab, setTab] = useState<'routes' | 'stops'>('routes');
  const [message, setMessage] = useState('Servicio activo');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const statusOpacity = useSharedValue(1);

  const statusStyle = useAnimatedStyle(() => ({opacity: statusOpacity.value}));
  useEffect(() => {
    statusOpacity.value = 0.4;
    statusOpacity.value = withTiming(1, {duration: 180});
  }, [message, statusOpacity]);

  useEffect(() => {
    const query = destinationLabel.trim();
    if (!supabase || query.length < 2 || destination) return;
    const timeout = setTimeout(async () => {
      setLoading(true);
      const {data, error} = await supabase.functions.invoke('search-transit', {body: {query, limit: 5}});
      setSuggestions(error ? [] : ((data?.data ?? []) as Suggestion[]));
      setLoading(false);
    }, 260);
    return () => clearTimeout(timeout);
  }, [destination, destinationLabel]);

  const visibleRoutes = useMemo(() => {
    const query = destinationLabel.toLocaleLowerCase('es-MX');
    if (!query) return ROUTES;
    return ROUTES.filter(route => `${route.name} ${route.detail}`.toLocaleLowerCase('es-MX').includes(query));
  }, [destinationLabel]);

  async function locate() {
    const permission = await request(
      Platform.OS === 'ios' ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
    );
    if (permission !== RESULTS.GRANTED && permission !== RESULTS.LIMITED) {
      setMessage('Activa el permiso de ubicación en tu dispositivo.');
      return;
    }
    setMessage('Buscando tu ubicación…');
    Geolocation.getCurrentPosition(
      position => {
        const coordinates = {latitude: position.coords.latitude, longitude: position.coords.longitude};
        setOrigin('Mi ubicación', coordinates);
        camera.current?.flyTo({center: [coordinates.longitude, coordinates.latitude], zoom: 15, duration: 700});
        setMessage('Ubicación actualizada');
      },
      () => setMessage('No pudimos obtener tu ubicación.'),
      {enableHighAccuracy: true, timeout: 8000},
    );
  }

  async function planJourney() {
    if (!destinationLabel.trim()) return setMessage('Escribe un destino para buscar rutas.');
    if (!supabase || !origin || !destination) return setMessage(`Mostrando rutas relacionadas con ${destinationLabel}.`);
    setLoading(true);
    const {data, error} = await supabase.functions.invoke('plan-journey', {body: {origin, destination}});
    setLoading(false);
    const options = data?.data as unknown[] | undefined;
    setMessage(error ? 'No pudimos calcular el viaje.' : options?.length ? `${options.length} opciones encontradas.` : 'Aún no hay una ruta directa.');
  }

  function selectSuggestion(suggestion: Suggestion) {
    setDestination(
      suggestion.label,
      suggestion.latitude !== null && suggestion.longitude !== null
        ? {latitude: suggestion.latitude, longitude: suggestion.longitude}
        : null,
    );
    setSuggestions([]);
    if (suggestion.entity_type === 'route') setActiveRouteId(String(suggestion.entity_id));
  }

  return (
    <View style={styles.root}>
      <MapView style={StyleSheet.absoluteFill} mapStyle="https://demotiles.maplibre.org/style.json" logo={false} compass={false} accessibilityLabel="Mapa de transporte público de Morelia">
        <Camera ref={camera} initialViewState={{center: [-101.194, 19.702], zoom: 13.3}} minZoom={10} maxZoom={19} />
        <GeoJSONSource id="routes" data={routesGeoJson}>
          <Layer id="route-lines" type="line" paint={{'line-color': ['get', 'color'], 'line-width': ['case', ['==', ['get', 'id'], activeRouteId], 7, 4], 'line-opacity': ['case', ['==', ['get', 'id'], activeRouteId], 1, 0.4]}} layout={{'line-cap': 'round', 'line-join': 'round'}} />
        </GeoJSONSource>
        <GeoJSONSource id="stops" data={stopsGeoJson}>
          <Layer id="stops-layer" type="circle" paint={{'circle-radius': 7, 'circle-color': colors.primary, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3}} />
        </GeoJSONSource>
      </MapView>

      <View pointerEvents="box-none" style={[styles.overlay, {paddingTop: insets.top + 4}]}>
        <View style={[styles.topbar, {backgroundColor: colors.bg, borderColor: colors.line}]}>
          <View style={[styles.brandMark, {backgroundColor: colors.primary}]}><Bus size={22} color="#FFFFFF" weight="fill" /></View>
          <View style={styles.brandCopy}><Text style={[styles.brandTitle, {color: colors.ink}]}>SIMUM</Text><Text style={[styles.brandSubtitle, {color: colors.muted}]}>Movilidad urbana de Morelia</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Favoritos" style={[styles.iconButton, {borderColor: colors.line}]}><Heart size={21} color={colors.ink} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir cuenta" onPress={() => navigation.navigate('Account')} style={[styles.iconButton, {borderColor: colors.line}]}><UserCircle size={22} color={colors.ink} /></Pressable>
        </View>

        <View style={[styles.mapActions, {top: insets.top + 78}]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Centrar en mi ubicación" onPress={locate} style={[styles.floatingButton, {backgroundColor: colors.bg, borderColor: colors.line}]}><Crosshair size={22} color={colors.ink} weight="bold" /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Mostrar rutas" onPress={() => setMessage('Mostrando todas las rutas')} style={[styles.floatingButton, {backgroundColor: colors.bg, borderColor: colors.line}]}><List size={22} color={colors.ink} /></Pressable>
        </View>

        <KeyboardAvoidingView style={styles.sheetPosition} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, {backgroundColor: colors.bg, borderColor: colors.line, paddingBottom: Math.max(insets.bottom, 10)}]}>
            <View style={[styles.handle, {backgroundColor: colors.line}]} />
            <View style={styles.headingRow}>
              <Text accessibilityRole="header" style={[styles.title, {color: colors.ink}]}>¿A dónde vas?</Text>
              <Animated.View style={[styles.status, {backgroundColor: colors.primarySoft}, statusStyle]}><View style={[styles.statusDot, {backgroundColor: colors.primary}]} /><Text numberOfLines={1} style={[styles.statusText, {color: colors.primary}]}>{message}</Text></Animated.View>
            </View>
            <View style={[styles.inputRow, {backgroundColor: colors.surface, borderColor: colors.line}]}><Crosshair size={19} color={colors.muted} /><TextInput accessibilityLabel="Origen" style={[styles.input, {color: colors.ink}]} value={originLabel} onChangeText={value => setOrigin(value)} /><Pressable accessibilityLabel="Usar mi ubicación" onPress={locate}><NavigationArrow size={19} color={colors.muted} /></Pressable></View>
            <View style={[styles.inputRow, {backgroundColor: colors.surface, borderColor: colors.line}]}><MapPin size={19} color={colors.muted} /><TextInput accessibilityLabel="Destino" style={[styles.input, {color: colors.ink}]} value={destinationLabel} onChangeText={value => {setDestination(value); setSuggestions([]);}} placeholder="Busca un lugar o colonia" placeholderTextColor={colors.muted} returnKeyType="search" onSubmitEditing={planJourney} /><Pressable accessibilityLabel="Intercambiar origen y destino"><ArrowsDownUp size={19} color={colors.muted} /></Pressable></View>
            {suggestions.length > 0 ? <View style={[styles.suggestions, {borderColor: colors.line}]}>{suggestions.map(suggestion => <Pressable key={`${suggestion.entity_type}-${suggestion.entity_id}`} onPress={() => selectSuggestion(suggestion)} style={[styles.suggestion, {borderBottomColor: colors.line}]}><MapPin size={17} color={colors.muted} /><View style={styles.suggestionCopy}><Text numberOfLines={1} style={[styles.suggestionTitle, {color: colors.ink}]}>{suggestion.label}</Text><Text numberOfLines={1} style={[styles.suggestionSubtitle, {color: colors.muted}]}>{suggestion.subtitle || 'Morelia'}</Text></View></Pressable>)}</View> : null}
            <Pressable accessibilityRole="button" disabled={loading} onPress={planJourney} style={[styles.primaryButton, {backgroundColor: colors.primary}]}><MagnifyingGlass size={20} color="#FFFFFF" weight="bold" /><Text style={styles.primaryText}>{loading ? 'Buscando…' : 'Buscar ruta'}</Text></Pressable>
            <View accessibilityRole="tablist" style={[styles.tabs, {backgroundColor: colors.surface}]}>{(['routes', 'stops'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{selected: tab === value}} onPress={() => setTab(value)} style={[styles.tab, tab === value && {backgroundColor: colors.bg}]}><Text style={[styles.tabText, {color: tab === value ? colors.ink : colors.muted}]}>{value === 'routes' ? 'Rutas cercanas' : 'Paradas'}</Text></Pressable>)}</View>
            <ScrollView style={styles.results} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {tab === 'routes' ? visibleRoutes.map(route => <Pressable key={route.id} accessibilityRole="button" accessibilityState={{selected: activeRouteId === route.id}} accessibilityLabel={`Ruta ${route.number}, ${route.name}, pasa en ${route.time}`} onPress={() => setActiveRouteId(route.id)} style={[styles.routeRow, activeRouteId === route.id && {backgroundColor: colors.surface}]}><View style={[styles.routeNumber, {backgroundColor: route.color}]}><Text style={styles.routeNumberText}>{route.number}</Text></View><View style={styles.routeCopy}><Text numberOfLines={1} style={[styles.routeName, {color: colors.ink}]}>{route.name}</Text><Text style={[styles.routeDetail, {color: colors.muted}]}>{route.detail}</Text></View><Text style={[styles.routeTime, {color: colors.muted}]}>{route.time}</Text></Pressable>) : ['Catedral', 'Mercado Independencia', 'Las Tarascas'].map((name, index) => <Pressable key={name} style={styles.routeRow}><View style={[styles.routeNumber, {backgroundColor: colors.primary}]}><MapPin size={18} color="#FFFFFF" weight="fill" /></View><View style={styles.routeCopy}><Text style={[styles.routeName, {color: colors.ink}]}>{name}</Text><Text style={[styles.routeDetail, {color: colors.muted}]}>A {3 + index * 3} min caminando</Text></View></Pressable>)}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1}, overlay: {flex: 1, justifyContent: 'space-between'}, topbar: {height: 64, marginHorizontal: 10, paddingHorizontal: 9, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 8},
  brandMark: {width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center'}, brandCopy: {flex: 1}, brandTitle: {fontSize: 16, fontWeight: '700', letterSpacing: -0.3}, brandSubtitle: {fontSize: 11, marginTop: 2},
  iconButton: {width: 44, height: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center'}, mapActions: {position: 'absolute', right: 12, gap: 8}, floatingButton: {width: 46, height: 46, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  sheetPosition: {width: '100%', maxHeight: '67%'}, sheet: {margin: 8, paddingHorizontal: 14, borderWidth: 1, borderRadius: 16, shadowColor: '#000000', shadowOpacity: 0.17, shadowRadius: 8, shadowOffset: {width: 0, height: 4}, elevation: 6}, handle: {width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginVertical: 9},
  headingRow: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10}, title: {flex: 1, fontSize: 22, fontWeight: '700', letterSpacing: -0.6}, status: {maxWidth: '52%', height: 28, borderRadius: 14, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 6}, statusDot: {width: 7, height: 7, borderRadius: 4}, statusText: {flexShrink: 1, fontSize: 11, fontWeight: '700'},
  inputRow: {height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 9}, input: {flex: 1, height: 46, fontSize: 15}, primaryButton: {height: 48, borderRadius: 12, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center'}, primaryText: {color: '#FFFFFF', fontSize: 15, fontWeight: '700'},
  suggestions: {borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginBottom: 8}, suggestion: {minHeight: 50, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 9}, suggestionCopy: {flex: 1}, suggestionTitle: {fontSize: 13, fontWeight: '700'}, suggestionSubtitle: {fontSize: 11, marginTop: 2},
  tabs: {height: 46, borderRadius: 12, padding: 4, flexDirection: 'row', marginTop: 10}, tab: {flex: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center'}, tabText: {fontSize: 13, fontWeight: '700'}, results: {maxHeight: 150}, routeRow: {minHeight: 66, borderRadius: 12, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 11}, routeNumber: {width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center'}, routeNumberText: {color: '#FFFFFF', fontSize: 16, fontWeight: '800'}, routeCopy: {flex: 1}, routeName: {fontSize: 14, fontWeight: '700'}, routeDetail: {fontSize: 12, marginTop: 3}, routeTime: {fontSize: 12, fontWeight: '600'},
});

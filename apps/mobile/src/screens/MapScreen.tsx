import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Camera, type CameraRef, GeoJSONSource, Layer, Map as MapView, Images} from '@maplibre/maplibre-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from '@react-native-community/geolocation';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ArrowsDownUp, Car, Crosshair, Heart, List, MagnifyingGlass, MapPin, NavigationArrow, UserCircle} from 'phosphor-react-native';
import {ActivityIndicator, FlatList, Modal, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, TextInput, useColorScheme, View} from 'react-native';
import type {RootStackParamList} from '../../App';
import {BrandMark} from '../components/BrandMark';
import {ROUTES, routeCollection} from '../data/demo';
import {supabase} from '../lib/supabase';
import {useTransitStore, type Coordinates} from '../store/transit-store';
import {dark, light} from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;
type Suggestion = {entity_type: string; entity_id: number; label: string; subtitle: string | null; latitude: number | null; longitude: number | null; saved_place_id?: number};
type RouteItem = {id: string; number: string; name: string; detail: string; time: string; color: string};
type RouteGeometry = GeoJSON.LineString | GeoJSON.MultiLineString;
type CachedGeometry = {geojson: GeoJSON.FeatureCollection; bounds: [number, number, number, number]};
type DrawerItem = RouteItem & {kind?: 'route' | 'stop'; secondaryTime?: string; listKey?: string};
type RouteFavorite = {id: number; route_id: number};
type SavedPlace = {id: number; label: string; address: string | null; kind: string; location: {type?: string; coordinates?: [number, number]} | null};

const ROUTES_CACHE_KEY = '@viamorelia/routes-v1';
const ROUTES_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
const EMPTY_GEOJSON: GeoJSON.FeatureCollection = {type: 'FeatureCollection', features: []};

function getGeometryBounds(geometry: RouteGeometry): [number, number, number, number] | null {
  const coordinates = geometry.type === 'MultiLineString' ? geometry.coordinates.flat() : geometry.coordinates;
  if (!coordinates.length) return null;

  let minLng = coordinates[0][0];
  let maxLng = minLng;
  let minLat = coordinates[0][1];
  let maxLat = minLat;
  for (const [lng, lat] of coordinates) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return [minLng, minLat, maxLng, maxLat];
}

function generateTrafficFallback(routeGeoJSON: any) {
  if (!routeGeoJSON || !routeGeoJSON.features || routeGeoJSON.features.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const features: any[] = [];
  const now = new Date();
  const hour = now.getHours();

  for (const routeFeature of routeGeoJSON.features) {
    const geometry = routeFeature.geometry;
    if (!geometry || (geometry.type !== "LineString" && geometry.type !== "MultiLineString")) {
      continue;
    }

    const routeId = routeFeature.properties?.id || "default";
    const routeName = routeFeature.properties?.name || "";

    const coordinatesList = geometry.type === "MultiLineString"
      ? geometry.coordinates
      : [geometry.coordinates];

    for (const coords of coordinatesList) {
      if (coords.length < 2) continue;

      for (let i = 0; i < coords.length - 1; i++) {
        const p1 = coords[i];
        const p2 = coords[i + 1];

        const coordSum = p1[0] + p1[1] + p2[0] + p2[1];
        const seed = Math.floor(Math.abs(Math.sin(coordSum) * 100000)) + now.getMinutes();

        let trafficLevel: "low" | "medium" | "heavy" = "low";
        let speed = 45;

        const isRushHour = (hour >= 8 && hour <= 9) || (hour >= 13 && hour <= 14) || (hour >= 18 && hour <= 19);
        const rand = seed % 100;

        if (isRushHour) {
          if (rand < 40) {
            trafficLevel = "heavy";
            speed = 10 + (seed % 10);
          } else if (rand < 80) {
            trafficLevel = "medium";
            speed = 22 + (seed % 8);
          } else {
            trafficLevel = "low";
            speed = 38 + (seed % 12);
          }
        } else {
          if (rand < 10) {
            trafficLevel = "heavy";
            speed = 12 + (seed % 8);
          } else if (rand < 30) {
            trafficLevel = "medium";
            speed = 25 + (seed % 10);
          } else {
            trafficLevel = "low";
            speed = 42 + (seed % 15);
          }
        }

        const colors = {
          low: "#10b981",
          medium: "#f97316",
          heavy: "#ef4444",
        };

        features.push({
          type: "Feature",
          properties: {
            route_id: routeId,
            route_name: routeName,
            traffic_level: trafficLevel,
            traffic_color: colors[trafficLevel],
            speed_kmh: speed,
          },
          geometry: {
            type: "LineString",
            coordinates: [p1, p2],
          },
        });
      }
    }
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

export function MapScreen({navigation}: Props) {
  const colors = useColorScheme() === 'dark' ? dark : light;
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraRef>(null);
  const {originLabel, destinationLabel, origin, destination, activeRouteId, setOrigin, setDestination, setActiveRouteId} = useTransitStore();
  const [tab, setTab] = useState<'routes'>('routes');
  const [favorites, setFavorites] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [showTraffic, setShowTraffic] = useState(false);
  const [trafficGeoJSON, setTrafficGeoJSON] = useState<any>(null);
  const [, setMessage] = useState('Servicio activo');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeInput, setActiveInput] = useState<'origin' | 'destination' | null>(null);

  // Show the bundled catalogue immediately; the database refresh replaces it
  // when available, but the drawer must not depend on a network round trip.
  const [routesList, setRoutesList] = useState<RouteItem[]>(() => ROUTES.map(route => ({...route})));
  const [activeRouteGeoJSON, setActiveRouteGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [journeyOptions, setJourneyOptions] = useState<any[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeRequestVersion, setRouteRequestVersion] = useState(0);
  const routeGeometryCache = useRef(new Map<string, CachedGeometry>());
  const suggestionCache = useRef(new Map<string, Suggestion[]>());

  const isOriginFavorited = useMemo(() => {
    return favorites.some(f => (f.place_id || f.stop_id || f.latitude) && f.custom_name === originLabel);
  }, [favorites, originLabel]);

  const isDestinationFavorited = useMemo(() => {
    return favorites.some(f => (f.place_id || f.stop_id || f.latitude) && f.custom_name === destinationLabel);
  }, [favorites, destinationLabel]);

  async function toggleFavoritePlace(label: string, coords: Coordinates | null) {
    if (!coords) return;
    const client = supabase;
    
    const existing = favorites.find(f => 
      f.custom_name === label && (f.place_id !== null || f.stop_id !== null || f.latitude !== undefined)
    );
    
    if (existing) {
      if (client && user) {
        const { error } = await client.from('favorites').delete().eq('id', existing.id);
        if (!error) {
          setFavorites(prev => prev.filter(f => f.id !== existing.id));
          setMessage('Lugar eliminado de favoritos');
        }
      } else {
        const updated = favorites.filter(f => f.id !== existing.id);
        setFavorites(updated);
        await AsyncStorage.setItem('local_favorites', JSON.stringify(updated));
        setMessage('Lugar eliminado de favoritos locales');
      }
    } else {
      if (client && user) {
        try {
          const { data: cityData } = await client.from('cities').select('id').eq('name', 'Morelia').limit(1);
          const cityId = cityData?.[0]?.id || 1;
          
          const { data: placeData, error: placeError } = await client
            .from('places')
            .insert({
              city_id: cityId,
              name: label,
              category: 'Favorito',
              address: 'Morelia, Michoacán',
              location: `POINT(${coords.longitude} ${coords.latitude})`,
            })
            .select('id')
            .single();
            
          if (!placeError && placeData) {
            const { data: favData, error: favError } = await client
              .from('favorites')
              .insert({
                user_id: user.id,
                place_id: placeData.id,
                custom_name: label,
              })
              .select()
              .single();
            if (!favError && favData) {
              setFavorites(prev => [...prev, favData]);
              setMessage('Guardado en favoritos');
            }
          }
        } catch (e) {
          console.warn('Supabase favorite failed, saving locally:', e);
        }
      } else {
        const newFav = {
          id: 'local_' + Date.now(),
          custom_name: label,
          latitude: coords.latitude,
          longitude: coords.longitude,
          is_local: true,
        };
        const updated = [...favorites, newFav];
        setFavorites(updated);
        await AsyncStorage.setItem('local_favorites', JSON.stringify(updated));
        setMessage('Guardado en favoritos locales');
      }
    }
  }

  async function toggleRouteFavorite(routeId: string) {
    const client = supabase;
    const existing = favorites.find(f => String(f.route_id) === String(routeId));
    
    if (existing) {
      if (client && user) {
        const { error } = await client.from('favorites').delete().eq('id', existing.id);
        if (!error) {
          setFavorites(prev => prev.filter(f => f.id !== existing.id));
          setMessage('Ruta eliminada de favoritos');
        }
      } else {
        const updated = favorites.filter(f => f.id !== existing.id);
        setFavorites(updated);
        await AsyncStorage.setItem('local_favorites', JSON.stringify(updated));
        setMessage('Ruta eliminada de favoritos locales');
      }
    } else {
      if (client && user) {
        const { data, error } = await client
          .from('favorites')
          .insert({
            user_id: user.id,
            route_id: parseInt(routeId, 10),
          })
          .select()
          .single();
        if (!error && data) {
          setFavorites(prev => [...prev, data]);
          setMessage('Ruta guardada en favoritos');
        }
      } else {
        const newFav = {
          id: 'local_' + Date.now(),
          route_id: parseInt(routeId, 10),
          is_local: true,
        };
        const updated = [...favorites, newFav];
        setFavorites(updated);
        await AsyncStorage.setItem('local_favorites', JSON.stringify(updated));
        setMessage('Ruta guardada en favoritos locales');
      }
    }
  }

  useEffect(() => {
    async function loadFavorites() {
      const client = supabase;
      let local: any[] = [];
      try {
        const stored = await AsyncStorage.getItem('local_favorites');
        if (stored) local = JSON.parse(stored);
      } catch (e) {}

      if (client) {
        try {
          const { data: { user: currentUser } } = await client.auth.getUser();
          setUser(currentUser);
          if (currentUser) {
            const { data, error } = await client
              .from('favorites')
              .select('*')
              .eq('user_id', currentUser.id);
            if (!error && data) {
              const merged = [...data];
              for (const f of local) {
                if (!merged.some(m => m.custom_name === f.custom_name && m.route_id === f.route_id)) {
                  merged.push(f);
                }
              }
              setFavorites(merged);
              return;
            }
          }
        } catch (e) {}
      }
      setFavorites(local);
    }
    loadFavorites();
  }, []);

  // Hydrate the catalogue from disk while refreshing it from Supabase in parallel.
  useEffect(() => {
    const client = supabase;
    let cancelled = false;

    function applyRoutes(routes: RouteItem[]) {
      if (cancelled || routes.length === 0) return;
      setRoutesList(routes);
      const selectedId = useTransitStore.getState().activeRouteId;
      if (!routes.some(route => route.id === selectedId)) setActiveRouteId(routes[0].id);
    }

    async function loadRoutes() {
      const cachedRoutesPromise = AsyncStorage.getItem(ROUTES_CACHE_KEY).catch(() => null);
      const networkRoutesPromise = client
        ? client
            .from('routes')
            .select('id, name, code, color, transport_type, description')
            .eq('is_active', true)
            .eq('validation_status', 'validated')
            .order('name', {ascending: true})
        : null;

      const cachedValue = await cachedRoutesPromise;
      if (cachedValue) {
        try {
          const cached = JSON.parse(cachedValue) as {savedAt: number; routes: RouteItem[]};
          if (Date.now() - cached.savedAt < ROUTES_CACHE_MAX_AGE) applyRoutes(cached.routes);
        } catch {
          AsyncStorage.removeItem(ROUTES_CACHE_KEY).catch(() => undefined);
        }
      }

      if (!networkRoutesPromise) return;
      try {
        const {data, error} = await networkRoutesPromise;
        if (error) {
          console.warn('Failed to query routes from Supabase:', error);
          return;
        }
        if (data?.length) {
          const mapped: RouteItem[] = data.map(route => {
            let number = route.transport_type === 'combi' ? 'C' : 'A';
            const match = route.code.match(/\d+/);
            if (match) number += match[0];
            return {
              id: String(route.id),
              number,
              name: route.name,
              detail: route.description || (route.transport_type === 'combi' ? 'Ruta de combi' : 'Ruta de autobús'),
              time: route.transport_type === 'combi' ? 'Combi' : 'Camión',
              color: route.color || '#FFA500',
            };
          });
          applyRoutes(mapped);
          AsyncStorage.setItem(ROUTES_CACHE_KEY, JSON.stringify({savedAt: Date.now(), routes: mapped})).catch(() => undefined);
        }
      } catch (error) {
        if (!cancelled) console.warn('Failed to query routes from Supabase:', error);
      }
    }

    loadRoutes();
    return () => {
      cancelled = true;
    };
  }, [setActiveRouteId]);

  // Load selected geometry with cancellation and an in-memory LRU-style cache.
  useEffect(() => {
    const client = supabase;
    if (!activeRouteId) return;
    const controller = new AbortController();

    function showGeometry(cached: CachedGeometry, duration: number) {
      setActiveRouteGeoJSON(cached.geojson);
      camera.current?.fitBounds(cached.bounds, {
        padding: {top: 72, right: 32, bottom: 48, left: 32},
        duration,
      });
    }

    const cached = routeGeometryCache.current.get(activeRouteId);
    if (cached) {
      routeGeometryCache.current.delete(activeRouteId);
      routeGeometryCache.current.set(activeRouteId, cached);
      setRouteLoading(false);
      setRouteError(null);
      showGeometry(cached, 280);
      return;
    }

    if (!client) {
      const fallback = routeCollection.features.find(feature => feature.properties?.id === activeRouteId);
      if (fallback && (fallback.geometry.type === 'LineString' || fallback.geometry.type === 'MultiLineString')) {
        const bounds = getGeometryBounds(fallback.geometry);
        if (bounds) {
          const geojson: GeoJSON.FeatureCollection = {type: 'FeatureCollection', features: [fallback]};
          showGeometry({geojson, bounds}, 280);
        }
      }
      return;
    }
    const activeClient = client;

    async function loadRouteGeometry() {
      setRouteLoading(true);
      setRouteError(null);
      try {
        const {data, error} = await activeClient
          .rpc('get_route_geometry', {p_route_id: Number(activeRouteId), p_tolerance: 0.000003})
          .abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        if (error) {
          console.warn('Failed loading route geometry:', error);
          setRouteError('No pudimos cargar esta ruta. Toca para reintentar.');
          return;
        }
        const variant = data?.[0] as {route_id: number; variant_name: string | null; color: string; geometry: RouteGeometry} | undefined;
        if (!variant?.geometry) {
          setRouteError('Esta ruta todavía no tiene un recorrido disponible.');
          return;
        }

        const bounds = getGeometryBounds(variant.geometry);
        if (!bounds) {
          setRouteError('El recorrido de esta ruta no contiene coordenadas válidas.');
          return;
        }
        const geojson: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: {id: activeRouteId, color: variant.color || '#FFA500', name: variant.variant_name || 'Principal'},
            geometry: variant.geometry,
          }],
        };
        const nextCached = {geojson, bounds};
        routeGeometryCache.current.set(activeRouteId, nextCached);
        if (routeGeometryCache.current.size > 12) {
          const oldestKey = routeGeometryCache.current.keys().next().value;
          if (oldestKey) routeGeometryCache.current.delete(oldestKey);
        }
        showGeometry(nextCached, 380);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn('Failed loading route geometry:', error);
          setRouteError('No pudimos cargar esta ruta. Toca para reintentar.');
        }
      } finally {
        if (!controller.signal.aborted) setRouteLoading(false);
      }
    }
    loadRouteGeometry();
    return () => controller.abort();
  }, [activeRouteId, routeRequestVersion]);

  // Dual autocomplete effect (origin or destination suggestions)
  useEffect(() => {
    const client = supabase;
    const query = activeInput === 'origin' ? originLabel.trim() : destinationLabel.trim();
    const coordsSet = activeInput === 'origin' ? origin : destination;
    
    if (!client || query.length < 2 || coordsSet || !activeInput) {
      setSuggestions([]);
      return;
    }

    const cacheKey = `${activeInput}:${query.toLocaleLowerCase('es-MX')}`;
    const cachedSuggestions = suggestionCache.current.get(cacheKey);
    if (cachedSuggestions) {
      setSuggestions(cachedSuggestions);
      return;
    }
    
    let cancelled = false;
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const localRequest = client.rpc('search_transit', {
          p_query: query,
          p_city_id: null,
          p_limit: 5,
          p_user_id: null,
        });
        const remoteRequest = client.functions.invoke('search-transit', {body: {query, limit: 5}});

        const localResult = await localRequest;
        if (!cancelled && !localResult.error && localResult.data) {
          const localSuggestions = (localResult.data as Suggestion[]).filter(item => item.entity_type !== 'route');
          if (localSuggestions.length > 0) setSuggestions(localSuggestions);
        }

        const {data, error} = await remoteRequest;
        if (cancelled) return;
        const nextSuggestions = error ? [] : ((data?.data ?? []) as Suggestion[]);
        setSuggestions(nextSuggestions);
        if (!error) {
          suggestionCache.current.set(cacheKey, nextSuggestions);
          if (suggestionCache.current.size > 20) {
            const oldestKey = suggestionCache.current.keys().next().value;
            if (oldestKey) suggestionCache.current.delete(oldestKey);
          }
        }
      } catch (err) {
        console.warn('Autocomplete query failed:', err);
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [activeInput, origin, destination, originLabel, destinationLabel]);

  // Fetch real-time traffic conditions periodically on mobile
  useEffect(() => {
    let intervalId: any;

    async function fetchTraffic() {
      try {
        const apiHost = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
        const res = await fetch(`${apiHost}/v1/traffic`);
        if (res.ok) {
          const geojson = await res.json();
          if (geojson && geojson.features && geojson.features.length > 0) {
            setTrafficGeoJSON(geojson);
            return;
          }
        }
      } catch (err) {
        // Fallback to local generation
      }

      const fallbackGeoJSON = generateTrafficFallback(activeRouteGeoJSON);
      setTrafficGeoJSON(fallbackGeoJSON);
    }

    if (showTraffic) {
      fetchTraffic();
      intervalId = setInterval(fetchTraffic, 30000); // 30s polling
    } else {
      setTrafficGeoJSON(null);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [showTraffic, activeRouteGeoJSON]);

  const visibleRoutes = useMemo(() => {
    const query = destinationLabel.trim().toLocaleLowerCase('es-MX');
    if (!query) return routesList;
    return routesList.filter(route => `${route.name} ${route.detail}`.toLocaleLowerCase('es-MX').includes(query));
  }, [destinationLabel, routesList]);

  const drawerItems = useMemo<DrawerItem[]>(() => {
    let baseRoutes = visibleRoutes;
    if (showOnlyFavorites) {
      baseRoutes = visibleRoutes.filter(r => favorites.some(f => String(f.route_id) === String(r.id)));
    }
    if (journeyOptions.length > 0 && !showOnlyFavorites) {
      return journeyOptions.map((option, index) => ({
        kind: 'route',
        id: String(option.route_id),
        number: option.route_code ? (option.route_code.split('_')[1] || option.route_code[0]) : 'R',
        name: option.route_name,
        detail: `Subir: ${option.boarding_stop_name || 'Parada cercana'}\nBajar: ${option.alighting_stop_name || 'Destino'}`,
        time: `${option.estimatedMinutes} min`,
        secondaryTime: `$${option.fare || '11.00'}`,
        color: option.route_color || '#FFA500',
        listKey: `${option.route_id}-${index}`,
      }));
    }
    return baseRoutes.map(route => ({...route, kind: 'route'}));
  }, [journeyOptions, visibleRoutes, showOnlyFavorites, favorites]);

  const selectDrawerItem = useCallback((item: DrawerItem) => {
    setActiveRouteId(item.id);
    setIsMenuOpen(false);
  }, [setActiveRouteId]);

  const renderDrawerItem = useCallback(({item}: {item: DrawerItem}) => {
    const selected = item.kind === 'route' && activeRouteId === item.id;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{selected}}
        onPress={() => selectDrawerItem(item)}
        style={[
          styles.routeRow,
          {backgroundColor: colors.bg, borderColor: colors.line},
          selected && {backgroundColor: colors.primarySoft, borderColor: colors.primary},
        ]}
      >
        <View style={[styles.routeNumberCircle, {backgroundColor: item.color}]}>
          {item.kind === 'stop'
            ? <MapPin size={18} color="#FFFFFF" weight="fill" />
            : <Text style={styles.routeNumberText}>{item.number}</Text>}
        </View>
        <View style={styles.routeCopy}>
          <Text numberOfLines={1} style={[styles.routeName, {color: colors.ink}]}>{item.name}</Text>
          <Text numberOfLines={2} style={[styles.routeDetail, {color: colors.muted}]}>{item.detail}</Text>
        </View>
        <View style={styles.routeTrailing}>
          {item.kind === 'route' && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Favorito"
              onPress={() => toggleRouteFavorite(item.id)}
              style={{padding: 6}}
            >
              <Heart
                size={18}
                color={favorites.some(f => String(f.route_id) === String(item.id)) ? colors.primary : colors.muted}
                weight={favorites.some(f => String(f.route_id) === String(item.id)) ? 'fill' : 'regular'}
              />
            </Pressable>
          )}
          {item.time ? <Text style={[styles.routeTimeTag, {color: selected ? colors.primary : colors.muted}]}>{item.time}</Text> : null}
          {item.secondaryTime ? <Text style={[styles.routeFare, {color: colors.muted}]}>{item.secondaryTime}</Text> : null}
        </View>
      </Pressable>
    );
  }, [activeRouteId, colors, favorites, selectDrawerItem]);

  async function locate() {
    if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
        title: 'Usar tu ubicación',
        message: 'ViaMorelia usa tu ubicación para mostrar paradas cercanas y planificar tu viaje.',
        buttonPositive: 'Permitir', buttonNegative: 'Ahora no',
      });
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        setMessage('Activa el permiso de ubicación para ver paradas cercanas.');
        return;
      }
    }
    setMessage('Buscando tu ubicación…');
    
    // Attempt high accuracy location (GPS)
    Geolocation.getCurrentPosition(
      position => {
        const coordinates = {latitude: position.coords.latitude, longitude: position.coords.longitude};
        setOrigin('Mi ubicación', coordinates);
        camera.current?.flyTo({center: [coordinates.longitude, coordinates.latitude], zoom: 15, duration: 700});
        setMessage('Ubicación actualizada');
      },
      error => {
        console.warn('GPS location failed, trying network...', error);
        // Fallback to low accuracy (Wi-Fi/cell tower triangulation) - essential for tablets!
        Geolocation.getCurrentPosition(
          lowPos => {
            const coordinates = {latitude: lowPos.coords.latitude, longitude: lowPos.coords.longitude};
            setOrigin('Mi ubicación', coordinates);
            camera.current?.flyTo({center: [coordinates.longitude, coordinates.latitude], zoom: 15, duration: 700});
            setMessage('Ubicación actualizada (Red)');
          },
          () => setMessage('No pudimos obtener tu ubicación. Verifica tu GPS/Wi-Fi.'),
          {enableHighAccuracy: false, timeout: 10000},
        );
      },
      {enableHighAccuracy: true, timeout: 6000},
    );
  }

  async function planJourney() {
    if (!destinationLabel.trim()) return setMessage('Escribe un destino para buscar rutas.');
    setIsMenuOpen(true);
    if (!supabase || !origin || !destination) return setMessage(`Mostrando rutas relacionadas con ${destinationLabel}.`);
    setLoading(true);
    setJourneyOptions([]);
    try {
      const {data, error} = await supabase.functions.invoke('plan-journey', {body: {origin, destination}});
      setLoading(false);
      const options = data?.data as any[] | undefined;
      if (!error && options && options.length > 0) {
        setJourneyOptions(options);
        setMessage(`${options.length} opciones encontradas.`);
        setActiveRouteId(String(options[0].route_id));
      } else {
        setJourneyOptions([]);
        setMessage(error ? 'No pudimos calcular el viaje.' : 'Aún no hay una ruta directa.');
      }
    } catch {
      setLoading(false);
      setJourneyOptions([]);
      setMessage('Error de red al calcular el viaje.');
    }
  }

  async function selectSuggestion(suggestion: Suggestion) {
    let lat = suggestion.latitude;
    let lon = suggestion.longitude;

    if (lat === null || lon === null) {
      const client = supabase;
      if (client && suggestion.entity_id !== 999999) {
        if (suggestion.entity_type === 'stop') {
          const { data } = await client.from('stops').select('location').eq('id', suggestion.entity_id).single();
          if (data && data.location) {
            const loc = data.location as { coordinates?: [number, number] } | null;
            lon = loc?.coordinates?.[0] || null;
            lat = loc?.coordinates?.[1] || null;
          }
        } else {
          const { data } = await client.from('places').select('location').eq('id', suggestion.entity_id).single();
          if (data && data.location) {
            if (typeof data.location === 'string') {
              const match = data.location.match(/POINT\(([^ ]+) ([^ ]+)\)/);
              if (match) {
                lon = parseFloat(match[1]);
                lat = parseFloat(match[2]);
              }
            } else if (data.location && Array.isArray(data.location.coordinates)) {
              lon = data.location.coordinates[0];
              lat = data.location.coordinates[1];
            }
          }
        }
      } else if (suggestion.entity_id === 999999) {
        const localFav = favorites.find(f => f.custom_name === suggestion.label || f.name === suggestion.label);
        if (localFav) {
          lat = localFav.latitude || null;
          lon = localFav.longitude || null;
        }
      }
    }

    const coords = lat !== null && lon !== null ? {latitude: lat, longitude: lon} : null;
    
    if (activeInput === 'origin') {
      setOrigin(suggestion.label, coords);
    } else {
      setDestination(suggestion.label, coords);
      if (suggestion.entity_type === 'route') setActiveRouteId(String(suggestion.entity_id));
    }
    setSuggestions([]);
    setActiveInput(null);
  }

  function swapLocations() {
    setOrigin(destinationLabel || 'Centro Histórico', destination);
    setDestination(originLabel === 'Mi ubicación' ? '' : originLabel, origin);
    setSuggestions([]);
  }

  const displayedSuggestions = useMemo(() => {
    const query = activeInput === 'origin' ? originLabel : destinationLabel;
    if (activeInput && query.trim().length < 2) {
      return favorites
        .filter(f => f.place_id || f.stop_id || f.latitude !== undefined)
        .map(fav => ({
          entity_type: fav.stop_id ? 'stop' : 'place',
          entity_id: fav.stop_id || fav.place_id || 999999,
          label: fav.custom_name,
          subtitle: fav.stop_id ? 'Parada favorita' : 'Lugar favorito',
          latitude: fav.latitude || null,
          longitude: fav.longitude || null,
        }));
    }
    return suggestions;
  }, [activeInput, originLabel, destinationLabel, favorites, suggestions]);

  return (
    <View style={styles.root}>
      <MapView style={StyleSheet.absoluteFill} mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json" logo={false} compass={false} attribution accessibilityLabel="Mapa de transporte público de Morelia">
        <Camera ref={camera} initialViewState={{center: [-101.194, 19.702], zoom: 13.3}} minZoom={10} maxZoom={19} />
        <Images images={{'route-arrow-icon': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAoElEQVR4Ae3BUYqEMBRFwXMk+9/ybftzHkpijAw0VvF6vQaEB22MCQ+RvvCXLCR94ZgsIH1hl4QvlUJu2LgoCUWAMGljQhKSUIQJ0hd2STijUsgg6Qu7JPSoFNIhfWGXhFEqhZzYeEASigDhQOMBKoWcaCykUkhHYwGVQgY1blAp5KLGBJUDMqFxkUohN0hfOCYLNK6ThRrj5J+E1+uXfQA38ic2CnPsfQAAAABJRU5ErkJggg=='}} />
        <GeoJSONSource id="routes" data={activeRouteGeoJSON || EMPTY_GEOJSON}>
          <Layer id="route-lines-casing" type="line" paint={{'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.2, 14, 4.0, 18, 5.0], 'line-opacity': 0.9}} layout={{'line-cap': 'round', 'line-join': 'round'}} />
          <Layer id="route-lines" type="line" paint={{'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 14, 2.2, 18, 3.2], 'line-opacity': 1.0}} layout={{'line-cap': 'round', 'line-join': 'round'}} />
          <Layer id="route-arrows" type="symbol" layout={{symbolPlacement: 'line', symbolSpacing: ['interpolate', ['linear'], ['zoom'], 10, 150, 15, 60], iconImage: 'route-arrow-icon', iconSize: ['interpolate', ['linear'], ['zoom'], 10, 0.28, 16, 0.45], iconRotationAlignment: 'map', iconAllowOverlap: false, iconIgnorePlacement: false} as any} />
        </GeoJSONSource>
        <GeoJSONSource id="traffic" data={trafficGeoJSON || EMPTY_GEOJSON}>
          <Layer
            id="traffic-lines"
            type="line"
            filter={['==', ['to-string', ['get', 'route_id']], String(activeRouteId)]}
            paint={{
              'line-color': ['get', 'traffic_color'],
              'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 14, 2.2, 18, 3.2],
              'line-opacity': 0.85,
            }}
            layout={{
              'line-cap': 'round',
              'line-join': 'round',
              visibility: showTraffic ? 'visible' : 'none',
            } as any}
          />
        </GeoJSONSource>
        <GeoJSONSource id="stops" data={EMPTY_GEOJSON}>
          <Layer id="stops-layer" type="circle" paint={{'circle-radius': 7, 'circle-color': colors.primary, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3}} />
        </GeoJSONSource>
      </MapView>

      <View pointerEvents="box-none" style={[styles.overlay, {paddingTop: insets.top + 4}]}>
        {/* Floating search inputs card at the top - Hidden when menu drawer is open */}
        {!isMenuOpen && (
          <View style={[styles.floatingSearchCard, {backgroundColor: colors.bg, borderColor: colors.line, top: insets.top + 8}]}>
            <Pressable onPress={() => setIsMenuOpen(true)} style={[styles.hamburgerBtn, {backgroundColor: colors.surface, borderColor: colors.line}]}>
              <List size={22} color={colors.ink} />
            </Pressable>

            <View style={{flex: 1}}>
              <View style={styles.searchFields}>
                <View style={[styles.compactInputRow, {borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line}]}>
                  <Crosshair size={16} color={colors.primary} />
                  <TextInput
                    accessibilityLabel="Origen"
                    style={[styles.compactInput, {color: colors.ink}]}
                    value={originLabel}
                    onChangeText={value => {
                      setOrigin(value);
                      setActiveInput('origin');
                    }}
                    onFocus={() => setActiveInput('origin')}
                    placeholder="Origen"
                    placeholderTextColor={colors.muted}
                  />
                  {origin && (
                    <Pressable onPress={() => toggleFavoritePlace(originLabel, origin)} style={{padding: 4}}>
                      <Heart size={16} color={isOriginFavorited ? colors.primary : colors.muted} weight={isOriginFavorited ? 'fill' : 'regular'} />
                    </Pressable>
                  )}
                  <Pressable onPress={locate} style={{padding: 4}}><NavigationArrow size={16} color={colors.muted} /></Pressable>
                </View>
                <View style={styles.compactInputRow}>
                  <MapPin size={16} color={colors.muted} />
                  <TextInput
                    accessibilityLabel="Destino"
                    style={[styles.compactInput, {color: colors.ink}]}
                    value={destinationLabel}
                    onChangeText={value => {
                      setDestination(value);
                      setActiveInput('destination');
                    }}
                    onFocus={() => setActiveInput('destination')}
                    placeholder="Busca un lugar o colonia"
                    placeholderTextColor={colors.muted}
                    returnKeyType="search"
                    onSubmitEditing={planJourney}
                  />
                  {destination && (
                    <Pressable onPress={() => toggleFavoritePlace(destinationLabel, destination)} style={{padding: 4}}>
                      <Heart size={16} color={isDestinationFavorited ? colors.primary : colors.muted} weight={isDestinationFavorited ? 'fill' : 'regular'} />
                    </Pressable>
                  )}
                  <Pressable onPress={swapLocations} style={{padding: 4}}><ArrowsDownUp size={16} color={colors.muted} /></Pressable>
                </View>
              </View>

              {/* suggestions absolute dropdown inside card */}
              {displayedSuggestions.length > 0 && activeInput ? (
                <View style={[styles.suggestions, {borderColor: colors.line}]}>
                  {displayedSuggestions.map(suggestion => {
                    const isFav = suggestion.subtitle?.includes('favorit');
                    return (
                      <Pressable
                        key={`${suggestion.entity_type}-${suggestion.entity_id}-${suggestion.label}`}
                        onPress={() => selectSuggestion(suggestion)}
                        style={[styles.suggestion, {borderBottomColor: colors.line}]}
                      >
                        {isFav ? (
                          <Heart size={17} color={colors.primary} weight="fill" />
                        ) : (
                          <MapPin size={17} color={colors.muted} />
                        )}
                        <View style={styles.suggestionCopy}>
                          <Text numberOfLines={1} style={[styles.suggestionTitle, {color: colors.ink}]}>{suggestion.label}</Text>
                          <Text numberOfLines={1} style={[styles.suggestionSubtitle, {color: colors.muted}]}>{suggestion.subtitle || 'Morelia'}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Buscar ruta"
              accessibilityState={{busy: loading, disabled: loading}}
              disabled={loading}
              onPress={planJourney}
              style={[styles.searchSubmitBtn, {backgroundColor: colors.primary}, loading && styles.disabled]}
            >
              <MagnifyingGlass size={22} color="#FFFFFF" weight="bold" />
            </Pressable>
          </View>
        )}

        {!isMenuOpen && (routeLoading || routeError) ? (
          <Pressable
            accessibilityRole={routeError ? 'button' : 'progressbar'}
            accessibilityLabel={routeError || 'Cargando recorrido'}
            disabled={!routeError}
            onPress={() => setRouteRequestVersion(version => version + 1)}
            style={[styles.routeStatus, {top: insets.top + 112, backgroundColor: colors.bg, borderColor: routeError ? colors.primary : colors.line}]}
          >
            {routeLoading ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={[styles.routeStatusIcon, {color: colors.primary}]}>!</Text>}
            <Text numberOfLines={2} style={[styles.routeStatusText, {color: colors.ink}]}>{routeError || 'Cargando recorrido…'}</Text>
          </Pressable>
        ) : null}

        {/* Floating actions on the right */}
        <View style={[styles.mapActions, {top: insets.top + 112}]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Centrar en mi ubicación" onPress={locate} style={[styles.floatingButton, {backgroundColor: colors.bg, borderColor: colors.line, marginBottom: 8}]}><Crosshair size={22} color={colors.ink} weight="bold" /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Mostrar tráfico" onPress={() => setShowTraffic(prev => !prev)} style={[styles.floatingButton, {backgroundColor: showTraffic ? colors.primarySoft : colors.bg, borderColor: showTraffic ? colors.primary : colors.line}]}><Car size={22} color={showTraffic ? colors.primary : colors.ink} weight={showTraffic ? 'fill' : 'regular'} /></Pressable>
        </View>

        {/* Floating Traffic Legend at the bottom-left of the overlay */}
        {showTraffic && (
          <View style={[styles.trafficLegend, {backgroundColor: colors.bg, borderColor: colors.line, bottom: Math.max(insets.bottom, 16)}]}>
            <Text style={[styles.legendTitle, {color: colors.ink}]}>Tránsito en tiempo real</Text>
            <View style={styles.legendRow}>
              <View style={[styles.legendIndicator, {backgroundColor: '#ef4444'}]} />
              <Text style={[styles.legendLabel, {color: colors.muted}]}>Mucho tráfico</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendIndicator, {backgroundColor: '#f97316'}]} />
              <Text style={[styles.legendLabel, {color: colors.muted}]}>Tráfico moderado</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendIndicator, {backgroundColor: '#10b981'}]} />
              <Text style={[styles.legendLabel, {color: colors.muted}]}>Poco tráfico</Text>
            </View>
          </View>
        )}
      </View>

      {/* Native modal keeps the drawer above the native map and gives it a viewport-sized layout. */}
      <Modal
        visible={isMenuOpen}
        transparent
        statusBarTranslucent
        hardwareAccelerated
        animationType="fade"
        onRequestClose={() => setIsMenuOpen(false)}
      >
        <View style={styles.drawerContainer}>
          <Pressable style={styles.backdrop} onPress={() => setIsMenuOpen(false)} />
          
          <View style={[styles.leftDrawer, {backgroundColor: colors.bg, borderColor: colors.line, paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 10)}]}>
            <View style={[styles.drawerHeader, {borderColor: colors.line}]}>
               <View style={[styles.brandMark, {backgroundColor: 'transparent'}]}><BrandMark size={32} /></View>
               <View style={styles.brandCopy}>
                 <Text style={[styles.brandTitle, {color: colors.ink, fontSize: 16, fontWeight: '700'}]}>ViaMorelia</Text>
                 <Text style={[styles.brandSubtitle, {color: colors.muted, fontSize: 9}]}>Movilidad de Morelia</Text>
               </View>
               <Pressable accessibilityRole="button" accessibilityLabel="Cerrar menú" onPress={() => setIsMenuOpen(false)} style={styles.closeBtn}>
                 <Text style={{fontWeight: 'bold', fontSize: 16, color: colors.ink}}>✕</Text>
               </Pressable>
             </View>

             <View style={styles.drawerContent}>
               <View style={[styles.drawerActions, {borderBottomColor: colors.line, flexDirection: 'row', gap: 8}]}>
                 <Pressable accessibilityRole="button" accessibilityLabel="Mi cuenta" onPress={() => { setIsMenuOpen(false); navigation.navigate('Account'); }} style={[styles.drawerActionRow, {borderColor: colors.line, flex: 1}]}>
                   <UserCircle size={22} color={colors.ink} />
                   <Text style={{color: colors.ink, marginLeft: 8, fontWeight: '500'}}>Mi Cuenta</Text>
                 </Pressable>
                 <Pressable accessibilityRole="button" accessibilityLabel="Favoritos" onPress={() => setShowOnlyFavorites(prev => !prev)} style={[styles.drawerActionRow, {borderColor: colors.line, justifyContent: 'center', width: 44, paddingHorizontal: 0, backgroundColor: showOnlyFavorites ? colors.primarySoft : colors.surface}]}>
                   <Heart size={22} color={showOnlyFavorites ? colors.primary : colors.ink} weight={showOnlyFavorites ? 'fill' : 'regular'} />
                 </Pressable>
               </View>

              <FlatList
                data={drawerItems}
                renderItem={renderDrawerItem}
                keyExtractor={item => item.listKey || `${item.kind}-${item.id}`}
                style={styles.drawerList}
                contentContainerStyle={styles.drawerListContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                initialNumToRender={10}
                maxToRenderPerBatch={8}
                updateCellsBatchingPeriod={40}
                windowSize={5}
                removeClippedSubviews={Platform.OS === 'android'}
                ListEmptyComponent={<Text style={[styles.empty, {color: colors.muted}]}>No encontramos rutas. Prueba con una colonia o punto conocido.</Text>}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1}, 
  overlay: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0},
  drawerContainer: {flex: 1, flexDirection: 'row'},
  topbar: {height: 54, paddingHorizontal: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6},
  brandMark: {width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center'}, 
  brandCopy: {flex: 1}, 
  brandTitle: {fontSize: 14, fontWeight: '700', letterSpacing: -0.3}, 
  brandSubtitle: {fontSize: 9, marginTop: 1}, 
  iconButton: {width: 38, height: 38, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center'},
  mapActions: {position: 'absolute', right: 12, gap: 8}, 
  floatingButton: {width: 46, height: 46, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center'}, 
  sheetPosition: {width: '100%', position: 'absolute', bottom: 0},
  sheet: {paddingHorizontal: 14, borderTopWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16, shadowColor: '#000000', shadowOpacity: 0.17, shadowRadius: 8, shadowOffset: {width: 0, height: -4}, elevation: 6}, 
  handle: {width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginVertical: 9},
  headingRow: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, marginTop: 16}, 
  title: {flex: 1, fontSize: 18, fontWeight: '700', letterSpacing: -0.6}, 
  status: {maxWidth: '52%', height: 28, borderRadius: 14, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 6}, 
  statusDot: {width: 7, height: 7, borderRadius: 4}, 
  statusText: {flexShrink: 1, fontSize: 11, fontWeight: '700'},
  inputRow: {height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 9}, 
  input: {flex: 1, height: 46, fontSize: 15}, 
  primaryButton: {height: 48, borderRadius: 12, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center'}, 
  primaryLabel: {color: '#FFFFFF', fontSize: 15, fontWeight: '700'}, 
  pressed: {opacity: 0.78, transform: [{scale: 0.98}]},
  disabled: {opacity: 0.55},
  suggestions: {
    position: 'absolute',
    top: 86,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    elevation: 8,
    zIndex: 100,
  },
  suggestion: {minHeight: 50, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 9}, 
  suggestionCopy: {flex: 1}, 
  suggestionTitle: {fontSize: 13, fontWeight: '700'}, 
  suggestionSubtitle: {fontSize: 11, marginTop: 2},
  tabs: {height: 46, borderRadius: 12, padding: 4, flexDirection: 'row', marginHorizontal: 14, marginTop: 28}, 
  tab: {flex: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center'}, 
  tabLabel: {fontSize: 13, fontWeight: '700'}, 
  results: {maxHeight: 220, marginTop: 8}, 
  routeRow: {minHeight: 68, borderRadius: 12, borderWidth: 1, padding: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 11}, 
  routeNumberCircle: {width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center'}, 
  routeNumberText: {color: '#25271F', fontSize: 16, fontWeight: '800'}, 
  routeCopy: {flex: 1}, 
  routeName: {fontSize: 14, fontWeight: '700'}, 
  routeDetail: {fontSize: 12, marginTop: 3}, 
  routeTimeTag: {fontSize: 12, fontWeight: '600'}, 
  routeTrailing: {alignItems: 'flex-end', justifyContent: 'center'},
  routeFare: {fontSize: 11, marginTop: 2},
  empty: {padding: 20, textAlign: 'center', fontSize: 13, lineHeight: 19},
  
  floatingSearchCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
    elevation: 5,
  },
  searchFields: {
    flex: 1,
    gap: 4,
  },
  compactInputRow: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 8,
  },
  compactInput: {
    flex: 1,
    height: 36,
    fontSize: 14,
    padding: 0,
  },
  hamburgerBtn: {
    width: 42,
    height: 76,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchSubmitBtn: {
    width: 44,
    height: 76,
    borderRadius: 12,
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
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  leftDrawer: {
    width: '80%',
    maxWidth: 300,
    alignSelf: 'stretch',
    zIndex: 1,
    borderRightWidth: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: {width: 4, height: 0},
    elevation: 16,
  },
  drawerHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  drawerActions: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  drawerActionRow: {
    height: 44,
    width: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  drawerContent: {
    flex: 1,
    minHeight: 0,
  },
  drawerList: {flex: 1, marginTop: 12},
  drawerListContent: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  trafficLegend: {
    position: 'absolute',
    left: 12,
    zIndex: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    minWidth: 140,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 3},
    elevation: 3,
  },
  legendTitle: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  legendIndicator: {
    width: 14,
    height: 4,
    borderRadius: 2,
  },
  legendLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
});

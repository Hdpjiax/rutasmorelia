import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Camera, type CameraRef, GeoJSONSource, Layer, Map as MapView, ViewAnnotation, Marker, UserLocation, Images} from '@maplibre/maplibre-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from '@react-native-community/geolocation';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ArrowsDownUp, Car, Crosshair, Heart, List, MagnifyingGlass, MapPin, NavigationArrow, UserCircle, Trash} from 'phosphor-react-native';
import {ActivityIndicator, Animated, FlatList, Keyboard, Modal, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, TextInput, useColorScheme, View} from 'react-native';
import type {RootStackParamList} from '../../App';
import {BrandMark} from '../components/BrandMark';
import {MAP_STYLE_URL} from '../config/map';
import {ROUTES, routeCollection} from '../data/demo';
import {supabase} from '../lib/supabase';
import {useTransitStore, type Coordinates} from '../store/transit-store';
import {dark, light} from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;
type Suggestion = {entity_type: string; entity_id: number | string; label: string; subtitle: string | null; latitude: number | null; longitude: number | null; saved_place_id?: number};
type RouteItem = {id: string; geometryId?: string; number: string; name: string; detail: string; time: string; color: string};
type RouteGeometry = GeoJSON.LineString | GeoJSON.MultiLineString;
type CachedGeometry = {geojson: GeoJSON.FeatureCollection; bounds: [number, number, number, number]};
type DrawerItem = RouteItem & {kind?: 'route' | 'stop'; secondaryTime?: string; listKey?: string};
type RouteFavorite = {id: number; route_id: number};
type SavedPlace = {id: number; label: string; address: string | null; kind: string; location: {type?: string; coordinates?: [number, number]} | null};

const ROUTES_CACHE_KEY = '@viamorelia/routes-v4';
const ROUTES_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
const EMPTY_GEOJSON: GeoJSON.FeatureCollection = {type: 'FeatureCollection', features: []};
const PUBLISHED_ROUTES_BASE_URL = 'https://www.viamorelia.org/routes';
const LOCAL_ROUTES_BASE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000/routes' : 'http://localhost:3000/routes';
const WHITE_ROAD_LAYERS = new Set([
  'tunnel_motorway_link', 'tunnel_service_track', 'tunnel_link', 'tunnel_minor', 'tunnel_secondary_tertiary', 'tunnel_trunk_primary', 'tunnel_motorway',
  'road_motorway_link', 'road_service_track', 'road_link', 'road_minor', 'road_secondary_tertiary', 'road_trunk_primary', 'road_motorway',
  'bridge_path_pedestrian', 'bridge_motorway_link', 'bridge_service_track', 'bridge_link', 'bridge_street', 'bridge_secondary_tertiary', 'bridge_trunk_primary', 'bridge_motorway',
  'road_pier', 'highway_path', 'highway_minor', 'highway_major_inner',
  'highway_motorway_inner', 'highway_motorway_bridge_inner', 'tunnel_motorway_inner',
  'road_minor_fill', 'road_service_fill', 'road_sec_fill_noramp', 'road_pri_fill_noramp',
  'road_trunk_fill_noramp', 'road_mot_fill_noramp', 'road_trunk_fill_ramp', 'road_mot_fill_ramp',
  'bridge_minor_fill', 'bridge_service_fill', 'bridge_sec_fill', 'bridge_pri_fill',
  'bridge_trunk_fill', 'bridge_mot_fill', 'tunnel_minor_fill', 'tunnel_service_fill',
  'tunnel_sec_fill', 'tunnel_pri_fill', 'tunnel_trunk_fill', 'tunnel_mot_fill',
]);
const ROAD_CASING_LAYERS = new Set([
  'tunnel_motorway_link_casing', 'tunnel_service_track_casing', 'tunnel_link_casing', 'tunnel_street_casing', 'tunnel_secondary_tertiary_casing', 'tunnel_trunk_primary_casing', 'tunnel_motorway_casing',
  'road_motorway_link_casing', 'road_service_track_casing', 'road_link_casing', 'road_minor_casing', 'road_secondary_tertiary_casing', 'road_trunk_primary_casing', 'road_motorway_casing',
  'bridge_motorway_link_casing', 'bridge_service_track_casing', 'bridge_link_casing', 'bridge_street_casing', 'bridge_path_pedestrian_casing', 'bridge_secondary_tertiary_casing', 'bridge_trunk_primary_casing', 'bridge_motorway_casing',
  'highway_major_casing', 'highway_motorway_casing', 'highway_motorway_bridge_casing',
  'tunnel_motorway_casing',
  'road_minor_case', 'road_service_case', 'road_sec_case_noramp', 'road_pri_case_noramp',
  'road_trunk_case_noramp', 'road_mot_case_noramp', 'road_trunk_case_ramp', 'road_mot_case_ramp',
  'bridge_minor_case', 'bridge_service_case', 'bridge_sec_case', 'bridge_pri_case',
  'bridge_trunk_case', 'bridge_mot_case', 'tunnel_minor_case', 'tunnel_service_case',
  'tunnel_sec_case', 'tunnel_pri_case', 'tunnel_trunk_case', 'tunnel_mot_case',
]);
const PERIFERICO_FILL_LAYERS = new Set([
  'tunnel_trunk_primary', 'tunnel_motorway', 'road_trunk_primary', 'road_motorway', 'bridge_trunk_primary', 'bridge_motorway',
  'road_trunk_fill_noramp', 'road_mot_fill_noramp', 'road_trunk_fill_ramp', 'road_mot_fill_ramp',
  'bridge_trunk_fill', 'bridge_mot_fill', 'tunnel_trunk_fill', 'tunnel_mot_fill',
]);
const PERIFERICO_CASING_LAYERS = new Set([
  'tunnel_trunk_primary_casing', 'tunnel_motorway_casing', 'road_trunk_primary_casing', 'road_motorway_casing', 'bridge_trunk_primary_casing', 'bridge_motorway_casing',
  'road_trunk_case_noramp', 'road_mot_case_noramp', 'road_trunk_case_ramp', 'road_mot_case_ramp',
  'bridge_trunk_case', 'bridge_mot_case', 'tunnel_trunk_case', 'tunnel_mot_case',
]);
const PERIFERICO_NAMES = ['Periférico Paseo de la República', 'Circuito Periférico Paseo de la República', 'Libramiento Paseo de la República'];

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

function getAccurateNativePosition(maxWaitMs = 6000, requiredAccuracyM = 80): Promise<any> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      position => resolve(position),
      error => {
        console.warn('[ViaMorelia] High accuracy location lookup failed, trying standard accuracy:', error);
        Geolocation.getCurrentPosition(
          pos => resolve(pos),
          err => reject(err),
          {enableHighAccuracy: false, timeout: 3000, maximumAge: 10000}
        );
      },
      {enableHighAccuracy: true, timeout: maxWaitMs, maximumAge: 10000}
    );
  });
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

function adjustRouteColorForDarkTheme(color: string): string {
  if (!color || !color.startsWith('#')) return color;
  let r = parseInt(color.slice(1, 3), 16);
  let g = parseInt(color.slice(3, 5), 16);
  let b = parseInt(color.slice(5, 7), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return color;

  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  // Adjust for dark mode: boost lightness and saturation if low
  if (l < 0.45) l = 0.55;
  if (s < 0.60) s = 0.85;

  let rOut, gOut, bOut;
  if (s === 0) {
    rOut = gOut = bOut = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    rOut = hue2rgb(p, q, h + 1/3);
    gOut = hue2rgb(p, q, h);
    bOut = hue2rgb(p, q, h - 1/3);
  }

  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(rOut)}${toHex(gOut)}${toHex(bOut)}`.toUpperCase();
}

function findClosestPointOnLine(
  geojson: any,
  target: {latitude: number, longitude: number} | null
): [number, number] | null {
  if (!geojson || !target || !geojson.features) return null;
  let minDistance = Infinity;
  let closestCoord: [number, number] | null = null;

  const lat1 = target.latitude;
  const lon1 = target.longitude;

  const getDistanceSq = (p: [number, number]) => {
    const dLat = p[1] - lat1;
    const dLon = p[0] - lon1;
    return dLat * dLat + dLon * dLon;
  };

  geojson.features.forEach((feature: any) => {
    if (feature.geometry && feature.geometry.type === 'LineString') {
      const coords = feature.geometry.coordinates as [number, number][];
      coords.forEach(p => {
        const dist = getDistanceSq(p);
        if (dist < minDistance) {
          minDistance = dist;
          closestCoord = p;
        }
      });
    } else if (feature.geometry && feature.geometry.type === 'MultiLineString') {
      const lines = feature.geometry.coordinates as [number, number][][];
      lines.forEach(line => {
        line.forEach(p => {
          const dist = getDistanceSq(p);
          if (dist < minDistance) {
            minDistance = dist;
            closestCoord = p;
          }
        });
      });
    }
  });

  return closestCoord;
}

type PulsingMarkerProps = {
  color: string;
};

function PulsingMarker({color}: PulsingMarkerProps) {
  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const pulse3 = useRef(new Animated.Value(0)).current;
  const pulse4 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const startLoop = (value: Animated.Value) => {
      value.setValue(0);
      Animated.loop(
        Animated.timing(value, {
          toValue: 1,
          duration: 2600,
          useNativeDriver: true,
        })
      ).start();
    };

    const t1 = setTimeout(() => startLoop(pulse1), 0);
    const t2 = setTimeout(() => startLoop(pulse2), 650);
    const t3 = setTimeout(() => startLoop(pulse3), 1300);
    const t4 = setTimeout(() => startLoop(pulse4), 1950);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      pulse1.stopAnimation();
      pulse2.stopAnimation();
      pulse3.stopAnimation();
      pulse4.stopAnimation();
    };
  }, [pulse1, pulse2, pulse3, pulse4]);

  const getRingStyle = (value: Animated.Value, maxScale: number) => ({
    position: 'absolute' as const,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color,
    transform: [{
      scale: value.interpolate({
        inputRange: [0, 1],
        outputRange: [0.2, maxScale],
      })
    }],
    opacity: value.interpolate({
      inputRange: [0, 0.15, 0.8, 1],
      outputRange: [0, 0.45, 0.12, 0],
    })
  });

  return (
    <View style={{alignItems: 'center', justifyContent: 'center', width: 64, height: 64}}>
      <Animated.View style={getRingStyle(pulse1, 1.3)} />
      <Animated.View style={getRingStyle(pulse2, 1.8)} />
      <Animated.View style={getRingStyle(pulse3, 2.4)} />
      <Animated.View style={getRingStyle(pulse4, 3.2)} />
      <View style={{
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: color,
        borderWidth: 3,
        borderColor: '#ffffff',
        shadowColor: '#000000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.4,
        shadowRadius: 3,
        elevation: 6
      }} />
    </View>
  );
}

export function MapScreen({navigation}: Props) {
  const colorScheme = useColorScheme();
  const colors = colorScheme === 'dark' ? dark : light;
  const mapStyleUrl = colorScheme === 'dark' ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/liberty';
  const [customMapStyle, setCustomMapStyle] = useState<any>(null);

  useEffect(() => {
    let active = true;
    const cacheKey = `custom_map_style_v3_${colorScheme}`;

    async function loadStyle() {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached && active) {
          setCustomMapStyle(JSON.parse(cached));
        }
      } catch (err) {
        console.warn('[ViaMorelia] Failed to read style from cache:', err);
      }

      const url = colorScheme === 'dark'
        ? 'https://tiles.openfreemap.org/styles/dark'
        : 'https://tiles.openfreemap.org/styles/liberty';

      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error();
        const styleJson = await response.json();

        if (colorScheme === 'dark') {
          if (Array.isArray(styleJson.layers)) {
            styleJson.layers.forEach((layer: any) => {
              const id = (layer.id || '').toLowerCase();
              
              // 1. Background color
              if (layer.type === 'background') {
                if (!layer.paint) layer.paint = {};
                layer.paint['background-color'] = '#1A1C24';
              }
              
              // 2. Water fill
              if (id.includes('water')) {
                if (!layer.paint) layer.paint = {};
                if (layer.type === 'fill') {
                  layer.paint['fill-color'] = '#0F172A';
                } else if (layer.type === 'line') {
                  layer.paint['line-color'] = '#0F172A';
                }
              }

              // 3. Roads/Streets visibility
              const isRoadLine = layer.type === 'line' && (
                id.includes('road') ||
                id.includes('highway') ||
                id.includes('motorway') ||
                id.includes('street') ||
                id.includes('bridge') ||
                id.includes('tunnel') ||
                id.includes('transportation')
              );
              const isRail = id.includes('rail') || id.includes('train');

              if (isRoadLine && !isRail) {
                const isCasing = id.includes('case') || id.includes('casing') || id.includes('outline');
                if (!layer.paint) layer.paint = {};
                layer.paint['line-color'] = isCasing ? '#111317' : '#2A2E3D';
                layer.paint['line-opacity'] = isCasing ? 0.8 : 1.0;
              }

              // 4. Street name labels legibility
              const isLabel = layer.type === 'symbol' && layer.layout && layer.layout['text-field'];
              if (isLabel && (id.includes('road') || id.includes('street') || id.includes('way') || id.includes('name'))) {
                if (!layer.paint) layer.paint = {};
                layer.paint['text-color'] = '#E2E8F0';
                layer.paint['text-halo-color'] = '#1A1C24';
                layer.paint['text-halo-width'] = 2.0;
              }
            });
          }
        } else {
          const peripheralNames = [
            'Periférico Paseo de la República',
            'Circuito Periférico Paseo de la República',
            'Libramiento Paseo de la República',
          ];

          if (Array.isArray(styleJson.layers)) {
            styleJson.layers.forEach((layer: any) => {
              const id = (layer.id || '').toLowerCase();
              const isRoadLine = layer.type === 'line' && (
                id.includes('road') ||
                id.includes('highway') ||
                id.includes('motorway') ||
                id.includes('street') ||
                id.includes('bridge') ||
                id.includes('tunnel') ||
                id.includes('transportation')
              );
              const isRail = id.includes('rail') || id.includes('train');

              if (isRoadLine && !isRail) {
                const isCasing = id.includes('case') || id.includes('casing') || id.includes('outline');
                if (!layer.paint) layer.paint = {};

                layer.paint['line-color'] = [
                  'case',
                  [
                    'in',
                    ['coalesce', ['get', 'name'], ''],
                    ['literal', peripheralNames],
                  ],
                  isCasing ? '#c97846' : '#e9ad82',
                  isCasing ? '#cbd0d8' : '#ffffff',
                ];
                layer.paint['line-opacity'] = isCasing ? 0.72 : 1.0;
              }
            });
          }
        }

        if (active) {
          setCustomMapStyle(styleJson);
          await AsyncStorage.setItem(cacheKey, JSON.stringify(styleJson));
        }
      } catch (err) {
        console.warn('[ViaMorelia] Failed to fetch or customize style from network, using URL fallback:', err);
        if (active) {
          setCustomMapStyle(url);
        }
      }
    }

    void loadStyle();

    return () => {
      active = false;
    };
  }, [colorScheme]);
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraRef>(null);
  const {originLabel, destinationLabel, origin, destination, activeRouteId, setOrigin, setDestination, setActiveRouteId} = useTransitStore();
  const [tab, setTab] = useState<'routes'>('routes');
  const [favorites, setFavorites] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [showTraffic, setShowTraffic] = useState(false);
  const [trafficGeoJSON, setTrafficGeoJSON] = useState<any>(null);
  const [message, setMessageState] = useState<string>('');
  const setMessage = useCallback((msg: string) => {
    setMessageState(msg);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      setMessageState('');
    }, 3800);
    return () => clearTimeout(timer);
  }, [message]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeInput, setActiveInput] = useState<'origin' | 'destination' | null>(null);

  // Show the bundled catalogue immediately; the database refresh replaces it
  // when available, but the drawer must not depend on a network round trip.
  const [routesList, setRoutesList] = useState<RouteItem[]>(() => ROUTES.map(route => ({...route})));
  const [activeRouteGeoJSON, setActiveRouteGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [journeyOptions, setJourneyOptions] = useState<any[]>([]);
  const [journeyTab, setJourneyTab] = useState<'direct' | 'transfer'>('direct');
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeRequestVersion, setRouteRequestVersion] = useState(0);
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const originInputRef = useRef<TextInput>(null);
  const destinationInputRef = useRef<TextInput>(null);

  useEffect(() => {
    Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 1800,
        useNativeDriver: true,
      })
    ).start();
  }, [pulseAnim]);

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

  // Automatically search user location on mount
  useEffect(() => {
    locate();
  }, []);

  // Load routes index from local server (Next.js public routes index.json) or production fallback
  useEffect(() => {
    let cancelled = false;

    function applyRoutes(routes: RouteItem[]) {
      if (cancelled || routes.length === 0) return;
      setRoutesList(routes);
      const selectedId = useTransitStore.getState().activeRouteId;
      if (selectedId && !routes.some(route => route.id === selectedId)) setActiveRouteId(routes[0].id);
    }

    async function loadRoutes() {
      const cachedRoutesPromise = AsyncStorage.getItem(ROUTES_CACHE_KEY).catch(() => null);

      const fetchRoutesFromBase = async (base: string) => {
        const isLocal = base.includes('10.0.2.2') || base.includes('localhost');
        const fetchController = new AbortController();
        const timeoutId = setTimeout(() => {
          if (isLocal) fetchController.abort();
        }, 1200);

        try {
          const response = await fetch(`${base}/index.json`, {
            signal: fetchController.signal,
          });
          clearTimeout(timeoutId);
          if (!response.ok) throw new Error();
          const data = await response.json();
          return data.routes ?? [];
        } catch (err) {
          clearTimeout(timeoutId);
          throw err;
        }
      };

      let routesData: any[] = [];
      try {
        routesData = await fetchRoutesFromBase(LOCAL_ROUTES_BASE_URL);
      } catch (err) {
        try {
          routesData = await fetchRoutesFromBase(PUBLISHED_ROUTES_BASE_URL);
        } catch (err2) {
          // If both fail, we will fallback to cached routes
        }
      }

      if (routesData.length > 0) {
        const mapped: RouteItem[] = routesData.map(route => ({
          id: String(route.id),
          geometryId: String(route.id),
          number: `${route.transportType === 'Combi' || route.transportType === 'combi' ? 'C' : 'A'}${String(route.id).replace(/\D/g, '') || String(route.id)}`,
          name: route.name,
          detail: route.transportType === 'Combi' || route.transportType === 'combi' ? 'Combi' : 'Camión',
          time: 'Ver recorrido',
          color: route.color || '#FFA500',
        }));
        applyRoutes(mapped);
        AsyncStorage.setItem(ROUTES_CACHE_KEY, JSON.stringify({savedAt: Date.now(), routes: mapped})).catch(() => undefined);
      } else {
        const cachedValue = await cachedRoutesPromise;
        if (cachedValue) {
          try {
            const cached = JSON.parse(cachedValue) as {savedAt: number; routes: RouteItem[]};
            applyRoutes(cached.routes);
          } catch {}
        }
      }
    }

    loadRoutes();
    return () => {
      cancelled = true;
    };
  }, [setActiveRouteId]);

  // Load selected geometry with cancellation and an in-memory LRU-style cache.
  useEffect(() => {
    if (!activeRouteId) return;
    const controller = new AbortController();

    function showGeometry(cached: CachedGeometry, duration: number) {
      setActiveRouteGeoJSON(cached.geojson);
      camera.current?.fitBounds(cached.bounds, {
        padding: {top: 132, right: 32, bottom: 72, left: 32},
        duration,
      });
    }

    async function loadRouteGeometry() {
      console.warn('[ViaMorelia] loadRouteGeometry called for route ID:', activeRouteId);
      setRouteLoading(true);
      setRouteError(null);
      setActiveRouteGeoJSON(null);

      const selected = routesList.find(route => route.id === activeRouteId);
      console.warn('[ViaMorelia] Selected route details:', selected);
      const geometryId = selected?.geometryId || activeRouteId;
      if (!geometryId) {
        console.warn('[ViaMorelia] Missing geometryId');
        setRouteError('Esta ruta no tiene un recorrido disponible.');
        setRouteLoading(false);
        return;
      }

      // Try local web server first, then fallback to public website
      const bases = [LOCAL_ROUTES_BASE_URL, PUBLISHED_ROUTES_BASE_URL];
      let loaded = false;

      for (const base of bases) {
        const url = `${base}/${encodeURIComponent(geometryId)}.geojson`;
        console.warn(`[ViaMorelia] Attempting to fetch route geometry from: ${url}`);
        
        const isLocal = base.includes('10.0.2.2') || base.includes('localhost');
        const fetchController = new AbortController();
        const timeoutId = setTimeout(() => {
          if (isLocal) {
            fetchController.abort();
            console.warn(`[ViaMorelia] Local fetch timed out for: ${url}`);
          }
        }, 1200);

        try {
          const response = await fetch(url, {
            signal: fetchController.signal,
          });
          clearTimeout(timeoutId);
          console.warn(`[ViaMorelia] Fetch response status for ${url}:`, response.status);
          if (response.ok) {
            const geojson = await response.json() as GeoJSON.FeatureCollection;
            console.warn(`[ViaMorelia] Successfully parsed geojson for ${geometryId}. Features count:`, geojson.features?.length);
            const geometryBounds = geojson.features
              .map(feature => feature.geometry)
              .filter((geometry): geometry is RouteGeometry => geometry.type === 'LineString' || geometry.type === 'MultiLineString')
              .map(getGeometryBounds)
              .filter((value): value is [number, number, number, number] => Boolean(value));
            
            if (geometryBounds.length) {
              const bounds = geometryBounds.reduce<[number, number, number, number]>((acc, value) => [
                Math.min(acc[0], value[0]), Math.min(acc[1], value[1]),
                Math.max(acc[2], value[2]), Math.max(acc[3], value[3]),
              ], [Infinity, Infinity, -Infinity, -Infinity]);

              const normalized: GeoJSON.FeatureCollection = {
                ...geojson,
                features: geojson.features.map(feature => ({
                  ...feature,
                  properties: {
                    ...feature.properties,
                    id: activeRouteId,
                    color: colorScheme === 'dark'
                      ? adjustRouteColorForDarkTheme(feature.properties?.color || selected?.color || '#FFC800')
                      : (feature.properties?.color || selected?.color || '#FFC800')
                  },
                })),
              };

              console.warn('[ViaMorelia] Setting activeRouteGeoJSON with features:', normalized.features.length);
              const nextCached = {geojson: normalized, bounds};
              routeGeometryCache.current.set(activeRouteId, nextCached);
              if (routeGeometryCache.current.size > 12) {
                const oldestKey = routeGeometryCache.current.keys().next().value;
                if (oldestKey) routeGeometryCache.current.delete(oldestKey);
              }

              showGeometry(nextCached, 380);
              loaded = true;
              break;
            } else {
              console.warn('[ViaMorelia] No geometry bounds found in geojson!');
            }
          }
        } catch (error) {
          clearTimeout(timeoutId);
          console.warn(`[ViaMorelia] Error fetching route geometry from ${url}:`, error);
        }
      }

      setRouteLoading(false);
      if (!loaded && !controller.signal.aborted) {
        console.warn(`[ViaMorelia] Failed to load route geometry for ${activeRouteId} from all bases`);
        setRouteError('No pudimos cargar esta ruta. Toca para reintentar.');
      }
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

    loadRouteGeometry();
    return () => controller.abort();
  }, [activeRouteId, routeRequestVersion, routesList]);

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
        let nextSuggestions = error ? [] : ((data?.data ?? []) as Suggestion[]);

        if (nextSuggestions.length === 0) {
          try {
            const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=19.702&lon=-101.194&limit=10`);
            if (response.ok) {
              const places = await response.json();
              nextSuggestions = Array.isArray(places.features) ? places.features.map((feature: any, index: number) => {
                const p = feature.properties;
                const name = p.name || "";
                const street = p.street || "";
                const housenumber = p.housenumber || "";
                const city = p.city || "Morelia";
                const state = p.state || "Michoacán";

                let label = name;
                if (housenumber && !label.includes(housenumber)) {
                  label = `${label} ${housenumber}`;
                }

                let subtitleParts = [];
                if (street && street !== name) {
                  subtitleParts.push(street);
                }
                subtitleParts.push(city);
                subtitleParts.push(state);
                const subtitle = subtitleParts.join(", ").trim();

                return {
                  entity_type: 'place',
                  entity_id: `photon-${p.osm_type}-${p.osm_id ?? index}`,
                  label,
                  subtitle,
                  latitude: Number(feature.geometry.coordinates[1]),
                  longitude: Number(feature.geometry.coordinates[0]),
                };
              }) : [];
            }
          } catch (fetchErr) {
            console.warn('Photon autocomplete query failed:', fetchErr);
          }
        }

        if (cancelled) return;
        setSuggestions(nextSuggestions);
        suggestionCache.current.set(cacheKey, nextSuggestions);
        if (suggestionCache.current.size > 20) {
          const oldestKey = suggestionCache.current.keys().next().value;
          if (oldestKey) suggestionCache.current.delete(oldestKey);
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
      const optionsForTab = journeyOptions.filter(option =>
        journeyTab === 'direct' ? Number(option.transfers || 0) === 0 : Number(option.transfers || 0) > 0,
      );
      return optionsForTab.map((option, index) => ({
        kind: 'route',
        id: String(option.route_code || option.route_id),
        number: option.route_code ? (option.route_code.split('_')[1] || option.route_code[0]) : 'R',
        name: option.route_name,
        detail: Number(option.transfers || 0) > 0
          ? `🚶 Camina ${Math.round(Number(option.origin_walk_meters || 0))} m\n📥 Sube: ${option.boarding_stop_name || 'Parada cercana'}\n🔄 Transbordo a ${option.second_route_name} (camina ${Math.round(Number(option.transfer_walk_meters || 0))} m)\n🏁 Baja: ${option.alighting_stop_name || 'Parada destino'} · camina ${Math.round(Number(option.destination_walk_meters || 0))} m`
          : `🚶 Camina ${Math.round(Number(option.origin_walk_meters || 0))} m\n📥 Sube: ${option.boarding_stop_name || 'Parada cercana'}\n🏁 Baja: ${option.alighting_stop_name || 'Parada destino'} · camina ${Math.round(Number(option.destination_walk_meters || 0))} m al destino`,
        time: `${option.estimatedMinutes} min`,
        secondaryTime: `$${option.fare || '11.00'}`,
        color: colorScheme === 'dark' ? adjustRouteColorForDarkTheme(option.route_color || '#FFA500') : (option.route_color || '#FFA500'),
        listKey: `${option.route_id}-${index}`,
      }));
    }
    return baseRoutes.map(route => ({
      ...route,
      kind: 'route',
      color: colorScheme === 'dark' ? adjustRouteColorForDarkTheme(route.color) : route.color
    }));
  }, [journeyOptions, journeyTab, visibleRoutes, showOnlyFavorites, favorites]);

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
          <Text style={[styles.routeDetail, {color: colors.muted, lineHeight: 16}]}>{item.detail}</Text>
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
    if (origin) {
      camera.current?.flyTo({center: [origin.longitude, origin.latitude], zoom: 16, duration: 700});
    }
    setMessage('Buscando tu ubicación…');
    
    try {
      const position = await getAccurateNativePosition();
      const coordinates = {latitude: position.coords.latitude, longitude: position.coords.longitude};
      setOrigin('Mi ubicación', coordinates);
      camera.current?.flyTo({center: [coordinates.longitude, coordinates.latitude], zoom: 16, duration: 700});
      setMessage(`Ubicación actualizada (precisión ±${Math.round(position.coords.accuracy)} m)`);
    } catch (error) {
      console.warn('No precise GPS location available:', error);
      if (origin) {
        camera.current?.flyTo({center: [origin.longitude, origin.latitude], zoom: 16, duration: 700});
        setMessage('Mostrando última ubicación conocida.');
      } else {
        setMessage('La señal GPS no tiene suficiente precisión. Activa Ubicación precisa e inténtalo de nuevo.');
      }
    }
  }

  async function planJourneyWithCoords(customOrigin = origin, customDestination = destination) {
    originInputRef.current?.blur();
    destinationInputRef.current?.blur();
    Keyboard.dismiss();
    setActiveInput(null);
    setSuggestions([]);
    if (!destinationLabel.trim()) return setMessage('Escribe un destino para buscar rutas.');
    setIsMenuOpen(true);
    if (!supabase || !customOrigin || !customDestination) return setMessage(`Mostrando rutas relacionadas con ${destinationLabel}.`);
    setLoading(true);
    setJourneyTab('direct');
    setJourneyOptions([]);
    try {
      const {data, error} = await supabase.functions.invoke('plan-journey', {body: {origin: customOrigin, destination: customDestination}});
      setLoading(false);
      const options = data?.data as any[] | undefined;
      if (!error && options && options.length > 0) {
        setJourneyOptions(options);
        setMessage(`${options.length} opciones encontradas.`);
        
        const hasDirect = options.some(opt => Number(opt.transfers || 0) === 0);
        const hasTransfers = options.some(opt => Number(opt.transfers || 0) > 0);
        
        if (hasDirect) {
          setJourneyTab('direct');
          const firstDirect = options.find(opt => Number(opt.transfers || 0) === 0);
          if (firstDirect) setActiveRouteId(String(firstDirect.route_code || firstDirect.route_id));
        } else if (hasTransfers) {
          setJourneyTab('transfer');
          setActiveRouteId(String(options[0].route_code || options[0].route_id));
        }
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

  async function planJourney() {
    let currentOrigin = origin;
    let currentDestination = destination;

    try {
      // 1. Resolve Origin if "Mi ubicación" and coordinates are null
      if (!currentOrigin && originLabel === 'Mi ubicación') {
        setMessage('Buscando tu ubicación…');
        try {
          const position = await getAccurateNativePosition(4000, 150);
          currentOrigin = {latitude: position.coords.latitude, longitude: position.coords.longitude};
          setOrigin('Mi ubicación', currentOrigin);
        } catch (err) {
          console.warn('[ViaMorelia] Fast location lookup failed, using center fallback:', err);
          currentOrigin = {latitude: 19.7027, longitude: -101.1944};
          setOrigin('Mi ubicación (respaldo Centro)', currentOrigin);
          setMessage('No se obtuvo GPS preciso; usando Centro Histórico.');
        }
      }

      const resolveCoords = async (suggestion: Suggestion) => {
        let lat = suggestion.latitude;
        let lon = suggestion.longitude;
        if (lat === null || lon === null) {
          const client = supabase;
          if (client && suggestion.entity_id !== 999999) {
            try {
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
            } catch (e) {
              console.warn('[ViaMorelia] Failed to resolve suggestion coords:', e);
            }
          }
        }
        return lat !== null && lon !== null ? {latitude: lat, longitude: lon} : null;
      };

      // 2. Resolve Destination if coordinates are null
      if (!currentDestination && destinationLabel.trim().length > 0) {
        const activeSuggestions = displayedSuggestions;
        if (activeSuggestions && activeSuggestions.length > 0) {
          const first = activeSuggestions[0];
          const coords = await resolveCoords(first);
          if (coords) {
            currentDestination = coords;
            setDestination(first.label, coords);
          }
        } else {
          // Direct fallback search in database
          const client = supabase;
          if (client) {
            try {
              const { data } = await client
                .from('places')
                .select('name, location')
                .ilike('name', `%${destinationLabel.trim()}%`)
                .limit(1);
              if (data && data[0] && data[0].location) {
                const firstPlace = data[0];
                let lat: number | null = null;
                let lon: number | null = null;
                if (typeof firstPlace.location === 'string') {
                  const match = firstPlace.location.match(/POINT\(([^ ]+) ([^ ]+)\)/);
                  if (match) {
                    lon = parseFloat(match[1]);
                    lat = parseFloat(match[2]);
                  }
                }
                if (lat !== null && lon !== null) {
                  currentDestination = {latitude: lat, longitude: lon};
                  setDestination(firstPlace.name, currentDestination);
                }
              }
            } catch (e) {
              console.warn('[ViaMorelia] Database fallback search failed:', e);
            }
          }
        }
      }

      // 3. Resolve Origin if coordinates are null (and not "Mi ubicación")
      if (!currentOrigin && originLabel.trim().length > 0 && originLabel !== 'Mi ubicación') {
        const activeSuggestions = displayedSuggestions;
        if (activeSuggestions && activeSuggestions.length > 0) {
          const first = activeSuggestions[0];
          const coords = await resolveCoords(first);
          if (coords) {
            currentOrigin = coords;
            setOrigin(first.label, coords);
          }
        } else {
          // Direct fallback search in database
          const client = supabase;
          if (client) {
            try {
              const { data } = await client
                .from('places')
                .select('name, location')
                .ilike('name', `%${originLabel.trim()}%`)
                .limit(1);
              if (data && data[0] && data[0].location) {
                const firstPlace = data[0];
                let lat: number | null = null;
                let lon: number | null = null;
                if (typeof firstPlace.location === 'string') {
                  const match = firstPlace.location.match(/POINT\(([^ ]+) ([^ ]+)\)/);
                  if (match) {
                    lon = parseFloat(match[1]);
                    lat = parseFloat(match[2]);
                  }
                }
                if (lat !== null && lon !== null) {
                  currentOrigin = {latitude: lat, longitude: lon};
                  setOrigin(firstPlace.name, currentOrigin);
                }
              }
            } catch (e) {
              console.warn('[ViaMorelia] Database fallback search failed for origin:', e);
            }
          }
        }
      }

    } catch (e) {
      console.error('[ViaMorelia] Error in planJourney prep:', e);
    } finally {
      originInputRef.current?.blur();
      destinationInputRef.current?.blur();
      Keyboard.dismiss();
      setActiveInput(null);
      setSuggestions([]);
      setIsMenuOpen(true);
      await planJourneyWithCoords(currentOrigin, currentDestination);
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
    
    const nextOrigin = activeInput === 'origin' ? coords : origin;
    const nextDestination = activeInput === 'destination' ? coords : destination;

    if (activeInput === 'origin') {
      setOrigin(suggestion.label, coords);
    } else {
      setDestination(suggestion.label, coords);
      if (suggestion.entity_type === 'route') setActiveRouteId(String(suggestion.entity_id));
    }
    setSuggestions([]);
    setActiveInput(null);

    let currentOrigin = nextOrigin;
    if (!currentOrigin && originLabel === 'Mi ubicación') {
      setMessage('Buscando tu ubicación…');
      try {
        const position = await getAccurateNativePosition(4000, 150);
        currentOrigin = {latitude: position.coords.latitude, longitude: position.coords.longitude};
        setOrigin('Mi ubicación', currentOrigin);
      } catch (err) {
        console.warn('[ViaMorelia] Fast location lookup failed on suggestion, using center fallback:', err);
        currentOrigin = {latitude: 19.7027, longitude: -101.1944};
        setOrigin('Mi ubicación (respaldo Centro)', currentOrigin);
        setMessage('No se obtuvo GPS preciso; usando Centro Histórico.');
      }
    }

    if (currentOrigin && nextDestination) {
      void planJourneyWithCoords(currentOrigin, nextDestination);
    }
  }

  function swapLocations() {
    setOrigin(destinationLabel || 'Centro Histórico', destination);
    setDestination(originLabel === 'Mi ubicación' ? '' : originLabel, origin);
    setSuggestions([]);
  }

  function clearMap() {
    setOrigin('', null);
    setDestination('', null);
    setActiveRouteId('');
    setActiveRouteGeoJSON(null);
    setSuggestions([]);
    setJourneyOptions([]);
    setMessage('Mapa limpio.');
  }

  const boardingCoord = useMemo(() => {
    return findClosestPointOnLine(activeRouteGeoJSON, origin);
  }, [activeRouteGeoJSON, origin]);

  const alightingCoord = useMemo(() => {
    return findClosestPointOnLine(activeRouteGeoJSON, destination);
  }, [activeRouteGeoJSON, destination]);

  const walkingPathsGeoJSON = useMemo(() => {
    if (!activeRouteGeoJSON || !origin || !destination || !boardingCoord || !alightingCoord) return null;
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { type: 'origin-walk' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [origin.longitude, origin.latitude],
              boardingCoord
            ]
          }
        },
        {
          type: 'Feature',
          properties: { type: 'destination-walk' },
          geometry: {
            type: 'LineString',
            coordinates: [
              alightingCoord,
              [destination.longitude, destination.latitude]
            ]
          }
        }
      ]
    };
  }, [activeRouteGeoJSON, origin, destination, boardingCoord, alightingCoord]);

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

  if (!customMapStyle) {
    return (
      <View style={[styles.root, {backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center'}]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <MapView style={StyleSheet.absoluteFill} mapStyle={customMapStyle || mapStyleUrl} logo={false} compass={true} touchRotate={true} attribution accessibilityLabel="Mapa de transporte público de Morelia">
        <Camera ref={camera} initialViewState={{center: [-101.194, 19.702], zoom: 13.3}} minZoom={10} maxZoom={19} />
        {!origin && (
          <UserLocation animated={true} accuracy={true} heading={true} />
        )}
        <Images images={{ 'route-arrow-icon': { source: { uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAoElEQVR4nO3WwQmEMBAF0PhJA+akFaz9V6MV6MmUoLCwtw0mM3/Uw3zwojP8BxJICB6Pp5B++BzhhuAKYQ1BzZAlBC3DFhBIlpgQ1Azt6/x9LCBoGbaAQLLEhEACYEKgATAgYAA0kMgEpHH6+z5vS1faiU8VUwBJUawCJEKxCJCIxb90pQ8151hTrPoFmVAsAmRicRMgGxS/5k7o8YSncwLzh1hDCb69SgAAAABJRU5ErkJggg==' } } }} />
        <GeoJSONSource id="routes" data={activeRouteGeoJSON || EMPTY_GEOJSON}>
          {colorScheme === 'dark' ? (
            <Layer
              id="route-lines-glow"
              type="line"
              style={{
                lineColor: ['get', 'color'],
                lineWidth: ['interpolate', ['linear'], ['zoom'], 10, 5.0, 14, 10.0, 18, 14.0],
                lineOpacity: 0.45,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          ) : (
            <Layer
              id="route-lines-shadow"
              type="line"
              style={{
                lineColor: '#000000',
                lineWidth: ['interpolate', ['linear'], ['zoom'], 10, 3.0, 14, 5.0, 18, 7.0],
                lineOpacity: 0.12,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          )}
          <Layer
            id="route-lines-casing"
            type="line"
            style={{
              lineColor: colorScheme === 'dark' ? '#111317' : '#FFFFFF',
              lineWidth: ['interpolate', ['linear'], ['zoom'], 10, 3.0, 14, 4.5, 18, 6.0],
              lineOpacity: colorScheme === 'dark' ? 0.9 : 1.0,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
          <Layer
            id="route-lines"
            type="line"
            style={{
              lineColor: ['get', 'color'],
              lineWidth: ['interpolate', ['linear'], ['zoom'], 10, 1.8, 14, 2.8, 18, 3.8],
              lineOpacity: 1.0,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
          <Layer
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
        {walkingPathsGeoJSON && (
          <GeoJSONSource id="walking-paths" data={walkingPathsGeoJSON as any}>
            <Layer
              id="walking-lines"
              type="line"
              style={{
                lineColor: colorScheme === 'dark' ? '#94A3B8' : '#64748B',
                lineWidth: 3,
                lineDasharray: [2, 2],
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </GeoJSONSource>
        )}
        {boardingCoord && (
          <Marker
            key={`boarding-stop-marker-${activeRouteId}-${colorScheme}`}
            id="boarding-stop-marker"
            lngLat={boardingCoord}
          >
            <View style={{
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
              zIndex: 999
            }}>
              <Text style={{color: '#FFFFFF', fontSize: 11, fontWeight: 'bold'}}>📥 Sube aquí</Text>
            </View>
          </Marker>
        )}
        {alightingCoord && (
          <Marker
            key={`alighting-stop-marker-${activeRouteId}-${colorScheme}`}
            id="alighting-stop-marker"
            lngLat={alightingCoord}
          >
            <View style={{
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
              zIndex: 999
            }}>
              <Text style={{color: '#FFFFFF', fontSize: 11, fontWeight: 'bold'}}>🏁 Baja aquí</Text>
            </View>
          </Marker>
        )}
        <GeoJSONSource id="traffic" data={trafficGeoJSON || EMPTY_GEOJSON}>
          <Layer
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
        <GeoJSONSource id="stops" data={EMPTY_GEOJSON}>
          <Layer
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
        {origin && (
          <ViewAnnotation
            key={`origin-marker-${activeRouteId}-${colorScheme}`}
            id="origin-marker"
            lngLat={[origin.longitude, origin.latitude]}
            draggable={true}
            onDragEnd={(e: any) => {
              const coords = e.nativeEvent.lngLat;
              if (coords && coords.length >= 2) {
                const newCoords = { latitude: coords[1], longitude: coords[0] };
                setOrigin("Ubicación en el mapa", newCoords);
                if (destination) {
                  void planJourneyWithCoords(newCoords, destination);
                }
              }
            }}
          >
            <PulsingMarker color="#2563eb" />
          </ViewAnnotation>
        )}
        {destination && (
          <ViewAnnotation
            key={`destination-marker-${activeRouteId}-${colorScheme}`}
            id="destination-marker"
            lngLat={[destination.longitude, destination.latitude]}
            draggable={true}
            onDragEnd={(e: any) => {
              const coords = e.nativeEvent.lngLat;
              if (coords && coords.length >= 2) {
                const newCoords = { latitude: coords[1], longitude: coords[0] };
                setDestination("Ubicación en el mapa", newCoords);
                if (origin) {
                  void planJourneyWithCoords(origin, newCoords);
                }
              }
            }}
          >
            <PulsingMarker color="#ef4444" />
          </ViewAnnotation>
        )}
      </MapView>

      <View pointerEvents="box-none" style={[styles.overlay, {paddingTop: insets.top + 4}]}>
        {/* Floating search inputs card at the top - Hidden when menu drawer is open */}
        {!isMenuOpen && (
          <View style={[styles.floatingSearchCard, {backgroundColor: colors.surface, borderColor: colors.line, top: insets.top + 8}]}>
            <Pressable onPress={() => setIsMenuOpen(true)} style={[styles.hamburgerBtn, {backgroundColor: colors.surface, borderColor: colors.line}]}>
              <List size={22} color={colors.ink} />
            </Pressable>

            <View style={{flex: 1}}>
              <View style={styles.searchFields}>
                <View style={[styles.compactInputRow, {borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line}]}>
                  <Crosshair size={16} color="#10B981" weight="bold" />
                  <TextInput
                    ref={originInputRef}
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
                  <Pressable onPress={locate} style={{padding: 4}}><NavigationArrow size={16} color={colors.primary} weight="fill" /></Pressable>
                </View>
                <View style={styles.compactInputRow}>
                  <MapPin size={16} color="#EF4444" weight="fill" />
                  <TextInput
                    ref={destinationInputRef}
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
                  <Pressable onPress={swapLocations} style={{padding: 4}}><ArrowsDownUp size={16} color={colors.primary} weight="bold" /></Pressable>
                </View>
              </View>

              {/* suggestions absolute dropdown inside card */}
              {displayedSuggestions.length > 0 && activeInput ? (
                <View style={[styles.suggestions, {borderColor: colors.line, backgroundColor: colors.surface}]}>
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
          <Pressable accessibilityRole="button" accessibilityLabel="Mostrar tráfico" onPress={() => setShowTraffic(prev => !prev)} style={[styles.floatingButton, {backgroundColor: showTraffic ? colors.primarySoft : colors.bg, borderColor: showTraffic ? colors.primary : colors.line, marginBottom: 8}]}><Car size={22} color={showTraffic ? colors.primary : colors.ink} weight={showTraffic ? 'fill' : 'regular'} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Limpiar mapa" onPress={clearMap} style={[styles.floatingButton, {backgroundColor: colors.bg, borderColor: colors.line}]}><Trash size={22} color={colors.ink} /></Pressable>
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

              {loading ? (
                <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60}}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={{color: colors.ink, fontSize: 14, marginTop: 16, fontWeight: '600', textAlign: 'center'}}>
                    Buscando las mejores rutas...
                  </Text>
                  <Text style={{color: colors.muted, fontSize: 11, marginTop: 6, textAlign: 'center', paddingHorizontal: 20}}>
                    Calculando transbordos y caminata óptima en Morelia.
                  </Text>
                </View>
              ) : (
                <>
                  {journeyOptions.length > 0 && !showOnlyFavorites ? (
                    <View style={[styles.journeyTabs, {backgroundColor: colors.surface}]} accessibilityRole="tablist">
                      {(['direct', 'transfer'] as const).map(tabValue => {
                        const selected = journeyTab === tabValue;
                        const count = journeyOptions.filter(option => tabValue === 'direct' ? Number(option.transfers || 0) === 0 : Number(option.transfers || 0) > 0).length;
                        return (
                          <Pressable
                            key={tabValue}
                            accessibilityRole="tab"
                            accessibilityState={{selected}}
                            onPress={() => setJourneyTab(tabValue)}
                            style={[styles.journeyTab, selected && {backgroundColor: colors.bg}]}
                          >
                            <Text style={[styles.journeyTabLabel, {color: selected ? colors.ink : colors.muted}]}>{tabValue === 'direct' ? 'Directos' : 'Transbordos'}</Text>
                            <View style={[styles.journeyTabCount, {backgroundColor: colors.surface}]}><Text style={[styles.journeyTabCountText, {color: colors.ink}]}>{count}</Text></View>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}

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
                    ListEmptyComponent={<Text style={[styles.empty, {color: colors.muted}]}>{journeyOptions.length > 0 && journeyTab === 'transfer' ? 'No necesitas un transbordo que reduzca significativamente la caminata.' : 'No encontramos rutas. Prueba con una colonia o punto conocido.'}</Text>}
                  />
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
      {Boolean(message) && (
        <View style={[
          styles.toastContainer,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            bottom: insets.bottom + 16,
          }
        ]}>
          <Text style={[styles.toastText, {color: colors.ink}]}>{message}</Text>
        </View>
      )}
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
  journeyTabs: {flexDirection: 'row', gap: 4, marginHorizontal: 14, marginBottom: 10, padding: 4, borderRadius: 12},
  journeyTab: {flex: 1, minHeight: 40, paddingHorizontal: 8, borderRadius: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5},
  journeyTabLabel: {fontSize: 12, fontWeight: '700'},
  journeyTabCount: {minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: 'center', justifyContent: 'center'},
  journeyTabCountText: {fontSize: 10, fontWeight: '800'},
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
  toastContainer: {
    position: 'absolute',
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '85%',
    zIndex: 9999,
  },
  toastText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});

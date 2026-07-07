import {
  DEFAULT_ORIGIN_LABEL,
  findFavoriteBySuggestion,
  favoriteCoords,
  selectInitialJourneyTab,
  type Coordinates,
  type Suggestion,
} from '@rutas-morelia/transit-core';
import type {CameraRef} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import {useCallback} from 'react';
import {Keyboard} from 'react-native';
import {
  effectiveRouteCatalog,
  planJourney,
  resolveActiveRouteIdFromJourney,
} from '../services/journey.service';
import {resolveSuggestionCoords, searchPlaceByName} from '../services/places.service';
import {supabase} from '../lib/supabase';
import {useFavoritesStore} from '../stores/favorites.store';
import {useTransitStore} from '../stores/transit.store';
import {useUiStore} from '../stores/ui.store';
import {useHaptics} from './useHaptics';

export function useJourney(camera: React.RefObject<CameraRef | null>) {
  const favorites = useFavoritesStore(s => s.favorites);
  const routes = useTransitStore(s => s.routes);
  const {
    originLabel,
    destinationLabel,
    origin,
    destination,
    setOrigin,
    setDestination,
    setActiveRouteId,
    setJourneyOptions,
    setJourneyTab,
    setJourneyLoading,
    setSheetMode,
    setActiveInput,
    resetJourney,
  } = useTransitStore();
  const setMessage = useUiStore(s => s.setMessage);
  const {success, light} = useHaptics();

  const dismissSearch = useCallback(() => {
    Keyboard.dismiss();
    setActiveInput(null);
  }, [setActiveInput]);

  const resolveCoords = useCallback(
    async (suggestion: Suggestion): Promise<Coordinates | null> => {
      if (suggestion.latitude != null && suggestion.longitude != null) {
        return {latitude: suggestion.latitude, longitude: suggestion.longitude};
      }
      const favorite = findFavoriteBySuggestion(favorites, suggestion);
      if (favorite) {
        const coords = favoriteCoords(favorite);
        if (coords) return coords;
      }
      return resolveSuggestionCoords(supabase, suggestion, favorites);
    },
    [favorites],
  );

  const planWithCoords = useCallback(
    async (from: Coordinates, to: Coordinates) => {
      dismissSearch();
      setSheetMode('journey');
      setJourneyLoading(true);
      setJourneyOptions([]);
      const catalog = effectiveRouteCatalog(routes);
      const {options, error, fromFallback} = await planJourney(supabase, from, to, catalog);
      setJourneyLoading(false);
      if (error || !options.length) {
        setMessage(error ?? 'Sin rutas disponibles', 'error');
        return;
      }
      setJourneyOptions(options);
      setJourneyTab(selectInitialJourneyTab(options));
      const routeId = resolveActiveRouteIdFromJourney(options, catalog);
      if (routeId) setActiveRouteId(routeId);
      success();
      setMessage(
        fromFallback
          ? `${options.length} opción estimada (sin Supabase)`
          : `${options.length} opciones encontradas`,
        fromFallback ? 'info' : 'success',
      );
    },
    [
      dismissSearch,
      setActiveRouteId,
      setJourneyLoading,
      setJourneyOptions,
      setJourneyTab,
      setMessage,
      setSheetMode,
      success,
      routes,
    ],
  );

  const planTrip = useCallback(async () => {
    dismissSearch();
    if (!destinationLabel.trim()) {
      setMessage('Escribe un destino para buscar rutas', 'error');
      return;
    }
    if (!origin && originLabel === DEFAULT_ORIGIN_LABEL) {
      setMessage('Usa el botón de ubicación para fijar tu origen', 'error');
      return;
    }
    if (!origin || !destination) {
      setMessage('Elige sugerencias con coordenadas válidas', 'error');
      return;
    }
    await planWithCoords(origin, destination);
  }, [destination, destinationLabel, dismissSearch, origin, originLabel, planWithCoords, setMessage]);

  const selectSuggestion = useCallback(
    async (suggestion: Suggestion, inputTarget: 'origin' | 'destination') => {
      const coords = await resolveCoords(suggestion);
      if (!coords) {
        setMessage('No pudimos ubicar ese lugar', 'error');
        return;
      }
      light();
      if (inputTarget === 'origin') {
        setOrigin(suggestion.label, coords);
        dismissSearch();
        return;
      }
      setDestination(suggestion.label, coords);
      if (suggestion.entity_type === 'route') setActiveRouteId(String(suggestion.entity_id));
      dismissSearch();
      if (origin) await planWithCoords(origin, coords);
      else setSheetMode('search');
    },
    [
      dismissSearch,
      light,
      origin,
      planWithCoords,
      resolveCoords,
      setActiveRouteId,
      setDestination,
      setMessage,
      setOrigin,
      setSheetMode,
    ],
  );

  const locate = useCallback(async () => {
    const {status} = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setMessage('Activa el permiso de ubicación', 'error');
      return;
    }
    setMessage('Buscando tu ubicación…', 'info');
    try {
      const position = await Location.getCurrentPositionAsync({accuracy: Location.Accuracy.High});
      const coords = {latitude: position.coords.latitude, longitude: position.coords.longitude};
      setOrigin(DEFAULT_ORIGIN_LABEL, coords);
      camera.current?.flyTo({center: [coords.longitude, coords.latitude], zoom: 16, duration: 600});
      success();
      setMessage('Ubicación actualizada', 'success');
    } catch {
      setMessage('No se pudo obtener tu ubicación', 'error');
    }
  }, [camera, setMessage, setOrigin, success]);

  const resolveEndpointLabel = useCallback(
    async (label: string, isOrigin: boolean): Promise<Coordinates | null> => {
      if (supabase) {
        const result = await searchPlaceByName(supabase, label);
        if (result) {
          if (isOrigin) setOrigin(result.name, result.coords);
          else setDestination(result.name, result.coords);
          return result.coords;
        }
      }
      return null;
    },
    [setDestination, setOrigin],
  );

  return {
    planTrip,
    planWithCoords,
    selectSuggestion,
    locate,
    resolveEndpointLabel,
    resetJourney,
    dismissSearch,
  };
}
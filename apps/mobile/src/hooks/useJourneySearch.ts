import type {CameraRef} from '@maplibre/maplibre-react-native';
import {useCallback, useState} from 'react';
import {Keyboard, PermissionsAndroid, Platform, type TextInput} from 'react-native';
import {
  favoriteCoords,
  findFavoriteBySuggestion,
  selectInitialJourneyRouteId,
  selectInitialJourneyTab,
} from '@rutas-morelia/transit-core';
import {getAccurateNativePosition} from '../lib/location';
import {resolveSuggestionCoords, searchPlaceByName} from '../lib/places';
import {supabase} from '../lib/supabase';
import type {SetMessageFn} from './useToast';
import type {Coordinates} from '../store/transit-store';
import type {FavoriteItem, JourneyOption, Suggestion} from '../types/transit';

type UseJourneySearchOptions = {
  originLabel: string;
  destinationLabel: string;
  origin: Coordinates | null;
  destination: Coordinates | null;
  setOrigin: (label: string, coordinates?: Coordinates | null) => void;
  setDestination: (label: string, coordinates?: Coordinates | null) => void;
  setActiveRouteId: (id: string) => void;
  setMessage: SetMessageFn;
  camera: React.RefObject<CameraRef | null>;
  favorites: FavoriteItem[];
  originInputRef: React.RefObject<TextInput | null>;
  destinationInputRef: React.RefObject<TextInput | null>;
  displayedSuggestions: Suggestion[];
  clearSuggestions: () => void;
  setActiveInput: (input: 'origin' | 'destination' | null) => void;
  setIsMenuOpen: (open: boolean) => void;
  activeInput: 'origin' | 'destination' | null;
};

export function useJourneySearch({
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
}: UseJourneySearchOptions) {
  const [journeyOptions, setJourneyOptions] = useState<JourneyOption[]>([]);
  const [journeyTab, setJourneyTab] = useState<'direct' | 'transfer'>('direct');
  const [loading, setLoading] = useState(false);

  const dismissSearchUi = useCallback(() => {
    originInputRef.current?.blur();
    destinationInputRef.current?.blur();
    Keyboard.dismiss();
    setActiveInput(null);
    clearSuggestions();
  }, [clearSuggestions, destinationInputRef, originInputRef, setActiveInput]);

  const planJourneyWithCoords = useCallback(
    async (customOrigin: Coordinates | null, customDestination: Coordinates | null) => {
      dismissSearchUi();
      if (!destinationLabel.trim()) {
        setMessage('Escribe un destino para buscar rutas.', 'error');
        return;
      }
      setIsMenuOpen(true);
      if (!supabase || !customOrigin || !customDestination) {
        setMessage(`Rutas hacia ${destinationLabel}.`, 'info');
        return;
      }

      setLoading(true);
      setJourneyTab('direct');
      setJourneyOptions([]);
      try {
        const {data, error} = await supabase.functions.invoke('plan-journey', {
          body: {origin: customOrigin, destination: customDestination},
        });
        const options = (data?.data ?? []) as JourneyOption[];
        if (!error && options.length > 0) {
          setJourneyOptions(options);
          setMessage(`${options.length} opciones encontradas.`, 'success');
          setJourneyTab(selectInitialJourneyTab(options));
          const routeId = selectInitialJourneyRouteId(options);
          if (routeId) setActiveRouteId(routeId);
        } else {
          setJourneyOptions([]);
          setMessage(error ? 'No pudimos calcular el viaje.' : 'Aún no hay una ruta directa.', 'error');
        }
      } catch {
        setJourneyOptions([]);
        setMessage('Error de red al calcular el viaje.', 'error');
      } finally {
        setLoading(false);
      }
    },
    [destinationLabel, dismissSearchUi, setActiveRouteId, setIsMenuOpen, setMessage],
  );

  const resolveCoordsForSuggestion = useCallback(
    async (suggestion: Suggestion): Promise<Coordinates | null> => {
      if (
        suggestion.latitude != null &&
        suggestion.longitude != null &&
        !(suggestion.latitude === 0 && suggestion.longitude === 0)
      ) {
        return {latitude: suggestion.latitude, longitude: suggestion.longitude};
      }

      const favorite = findFavoriteBySuggestion(favorites, suggestion);
      if (favorite) {
        const fromFavorite = favoriteCoords(favorite);
        if (fromFavorite) return fromFavorite;
      }

      return resolveSuggestionCoords(supabase, suggestion, favorites);
    },
    [favorites],
  );

  const resolveEndpoint = useCallback(
    async (
      label: string,
      current: Coordinates | null,
      isOrigin: boolean,
      suggestion?: Suggestion,
    ): Promise<Coordinates | null> => {
      if (current) return current;
      if (!label.trim() || (isOrigin && label === 'Mi ubicación')) return null;

      if (suggestion) {
        const coords = await resolveCoordsForSuggestion(suggestion);
        if (coords) {
          if (isOrigin) setOrigin(suggestion.label, coords);
          else setDestination(suggestion.label, coords);
          return coords;
        }
      }

      if (displayedSuggestions.length > 0) {
        const match =
          displayedSuggestions.find(s => s.label === label) ?? displayedSuggestions[0];
        const coords = await resolveCoordsForSuggestion(match);
        if (coords) {
          if (isOrigin) setOrigin(match.label, coords);
          else setDestination(match.label, coords);
          return coords;
        }
      }

      const favoriteMatch = favorites.find(
        f =>
          f.custom_name === label ||
          f.place?.name === label ||
          f.name === label,
      );
      if (favoriteMatch) {
        const coords = await resolveCoordsForSuggestion({
          entity_type: 'place',
          entity_id: favoriteMatch.place_id || favoriteMatch.id,
          label,
          subtitle: null,
          latitude: null,
          longitude: null,
        });
        if (coords) {
          if (isOrigin) setOrigin(label, coords);
          else setDestination(label, coords);
          return coords;
        }
      }

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
    [displayedSuggestions, favorites, resolveCoordsForSuggestion, setDestination, setOrigin],
  );

  const planJourney = useCallback(async () => {
    dismissSearchUi();

    if (!destinationLabel.trim()) {
      setMessage('Escribe un destino para buscar rutas.', 'error');
      return;
    }

    try {
      let currentOrigin = origin;
      let currentDestination = destination;

      if (!currentOrigin && originLabel === 'Mi ubicación') {
        setMessage('Toca el botón de ubicación para fijar tu origen.', 'error');
        return;
      }

      currentDestination = await resolveEndpoint(destinationLabel, currentDestination, false);
      currentOrigin = await resolveEndpoint(originLabel, currentOrigin, true);

      if (!currentDestination) {
        setMessage('No pudimos ubicar el destino. Elige una sugerencia o escribe un lugar conocido.', 'error');
        return;
      }

      if (!currentOrigin) {
        setMessage('No pudimos ubicar el origen. Elige una sugerencia o usa tu ubicación.', 'error');
        return;
      }

      await planJourneyWithCoords(currentOrigin, currentDestination);
    } catch (e) {
      if (__DEV__) console.error('[ViaMorelia] Error in planJourney prep:', e);
      setMessage('Ocurrió un error al preparar el viaje.', 'error');
    }
  }, [
    destination,
    destinationLabel,
    dismissSearchUi,
    origin,
    originLabel,
    planJourneyWithCoords,
    resolveEndpoint,
    setMessage,
  ]);

  const selectSuggestion = useCallback(
    async (suggestion: Suggestion) => {
      const coords = await resolveCoordsForSuggestion(suggestion);
      const inputTarget = activeInput ?? 'destination';

      if (inputTarget === 'origin') {
        if (!coords) {
          setMessage('No pudimos ubicar ese lugar. Elige otra sugerencia.', 'error');
          return;
        }
        setOrigin(suggestion.label, coords);
        dismissSearchUi();
        return;
      }

      if (!coords) {
        setMessage('No pudimos ubicar el destino. Elige una sugerencia o escribe un lugar conocido.', 'error');
        return;
      }

      setDestination(suggestion.label, coords);
      if (suggestion.entity_type === 'route') setActiveRouteId(String(suggestion.entity_id));
      dismissSearchUi();
      setIsMenuOpen(true);

      if (origin) {
        await planJourneyWithCoords(origin, coords);
        return;
      }

      if (originLabel === 'Mi ubicación') {
        setMessage('Toca el botón de ubicación para fijar tu origen.', 'info');
        return;
      }

      setMessage(`Rutas hacia ${suggestion.label}.`, 'info');
    },
    [
      activeInput,
      dismissSearchUi,
      origin,
      originLabel,
      planJourneyWithCoords,
      resolveCoordsForSuggestion,
      setActiveRouteId,
      setDestination,
      setMessage,
      setOrigin,
      setIsMenuOpen,
    ],
  );

  const locate = useCallback(async () => {
    if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
        title: 'Usar tu ubicación',
        message: 'ViaMorelia usa tu ubicación para mostrar paradas cercanas y planificar tu viaje.',
        buttonPositive: 'Permitir',
        buttonNegative: 'Ahora no',
      });
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        setMessage('Activa el permiso de ubicación para ver paradas cercanas.', 'error');
        return;
      }
    }

    setOrigin('Mi ubicación', origin);
    setMessage('Buscando tu ubicación…', 'info');

    try {
      const position = await getAccurateNativePosition(5000, 150, updatePosition => {
        const coordinates = {latitude: updatePosition.coords.latitude, longitude: updatePosition.coords.longitude};
        setOrigin('Mi ubicación', coordinates);
        camera.current?.flyTo({center: [coordinates.longitude, coordinates.latitude], zoom: 16, duration: 500});
      });
      const coordinates = {latitude: position.coords.latitude, longitude: position.coords.longitude};
      setOrigin('Mi ubicación', coordinates);
      camera.current?.flyTo({center: [coordinates.longitude, coordinates.latitude], zoom: 16, duration: 700});
      setMessage(`Ubicación actualizada (precisión ±${Math.round(position.coords.accuracy)} m)`, 'success');
    } catch (error) {
      if (__DEV__) console.warn('No precise GPS location available:', error);
      if (origin) {
        setOrigin('Mi ubicación', origin);
        camera.current?.flyTo({center: [origin.longitude, origin.latitude], zoom: 16, duration: 700});
        setMessage('Mostrando última ubicación conocida.', 'info');
      } else {
        setMessage('La señal GPS no tiene suficiente precisión. Activa Ubicación precisa e inténtalo de nuevo.', 'error');
      }
    }
  }, [camera, origin, setMessage, setOrigin]);

  const swapLocations = useCallback(() => {
    setOrigin(destinationLabel || 'Centro Histórico', destination);
    setDestination(originLabel === 'Mi ubicación' ? '' : originLabel, origin);
    clearSuggestions();
  }, [clearSuggestions, destination, destinationLabel, origin, originLabel, setDestination, setOrigin]);

  const resetJourney = useCallback(() => {
    setJourneyOptions([]);
    setJourneyTab('direct');
  }, []);

  return {
    journeyOptions,
    journeyTab,
    setJourneyTab,
    loading,
    planJourney,
    planJourneyWithCoords,
    selectSuggestion,
    locate,
    swapLocations,
    resetJourney,
    dismissSearchUi,
  };
}
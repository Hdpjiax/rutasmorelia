import type {CameraRef} from '@maplibre/maplibre-react-native';
import {useCallback, useState} from 'react';
import {Keyboard, PermissionsAndroid, Platform, type TextInput} from 'react-native';
import {selectInitialJourneyRouteId, selectInitialJourneyTab} from '@rutas-morelia/transit-core';
import {getAccurateNativePosition, MORELIA_CENTER} from '../lib/location';
import {resolveSuggestionCoords, searchPlaceByName} from '../lib/places';
import {supabase} from '../lib/supabase';
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
  setMessage: (msg: string) => void;
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

  const resolveCurrentOrigin = useCallback(async (): Promise<Coordinates | null> => {
    if (origin) return origin;
    if (originLabel !== 'Mi ubicación') return null;

    setMessage('Buscando tu ubicación…');
    try {
      const position = await getAccurateNativePosition(4000, 150);
      const coords = {latitude: position.coords.latitude, longitude: position.coords.longitude};
      setOrigin('Mi ubicación', coords);
      return coords;
    } catch (err) {
      if (__DEV__) console.warn('[ViaMorelia] Fast location lookup failed, using center fallback:', err);
      const coords = {...MORELIA_CENTER};
      setOrigin('Mi ubicación (respaldo Centro)', coords);
      setMessage('No se obtuvo GPS preciso; usando Centro Histórico.');
      return coords;
    }
  }, [origin, originLabel, setMessage, setOrigin]);

  const planJourneyWithCoords = useCallback(
    async (customOrigin: Coordinates | null, customDestination: Coordinates | null) => {
      dismissSearchUi();
      if (!destinationLabel.trim()) {
        setMessage('Escribe un destino para buscar rutas.');
        return;
      }
      setIsMenuOpen(true);
      if (!supabase || !customOrigin || !customDestination) {
        setMessage(`Mostrando rutas relacionadas con ${destinationLabel}.`);
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
          setMessage(`${options.length} opciones encontradas.`);
          setJourneyTab(selectInitialJourneyTab(options));
          const routeId = selectInitialJourneyRouteId(options);
          if (routeId) setActiveRouteId(routeId);
        } else {
          setJourneyOptions([]);
          setMessage(error ? 'No pudimos calcular el viaje.' : 'Aún no hay una ruta directa.');
        }
      } catch {
        setJourneyOptions([]);
        setMessage('Error de red al calcular el viaje.');
      } finally {
        setLoading(false);
      }
    },
    [destinationLabel, dismissSearchUi, setActiveRouteId, setIsMenuOpen, setMessage],
  );

  const resolveEndpoint = useCallback(
    async (
      label: string,
      current: Coordinates | null,
      isOrigin: boolean,
    ): Promise<Coordinates | null> => {
      if (current) return current;
      if (!label.trim() || (isOrigin && label === 'Mi ubicación')) return null;

      if (displayedSuggestions.length > 0) {
        const coords = await resolveSuggestionCoords(supabase, displayedSuggestions[0], favorites);
        if (coords) {
          if (isOrigin) setOrigin(displayedSuggestions[0].label, coords);
          else setDestination(displayedSuggestions[0].label, coords);
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
    [displayedSuggestions, favorites, setDestination, setOrigin],
  );

  const planJourney = useCallback(async () => {
    dismissSearchUi();

    if (!destinationLabel.trim()) {
      setMessage('Escribe un destino para buscar rutas.');
      return;
    }

    try {
      let currentOrigin = origin;
      let currentDestination = destination;

      if (!currentOrigin && originLabel === 'Mi ubicación') {
        currentOrigin = await resolveCurrentOrigin();
      }

      currentDestination = await resolveEndpoint(destinationLabel, currentDestination, false);
      currentOrigin = await resolveEndpoint(originLabel, currentOrigin, true);

      if (!currentDestination) {
        setMessage('No pudimos ubicar el destino. Elige una sugerencia o escribe un lugar conocido.');
        return;
      }

      if (!currentOrigin) {
        setMessage('No pudimos ubicar el origen. Elige una sugerencia o usa tu ubicación.');
        return;
      }

      await planJourneyWithCoords(currentOrigin, currentDestination);
    } catch (e) {
      if (__DEV__) console.error('[ViaMorelia] Error in planJourney prep:', e);
      setMessage('Ocurrió un error al preparar el viaje.');
    }
  }, [
    destination,
    destinationLabel,
    dismissSearchUi,
    origin,
    originLabel,
    planJourneyWithCoords,
    resolveCurrentOrigin,
    resolveEndpoint,
    setMessage,
  ]);

  const selectSuggestion = useCallback(
    async (suggestion: Suggestion) => {
      const coords = await resolveSuggestionCoords(supabase, suggestion, favorites);
      const nextOrigin = activeInput === 'origin' ? coords : origin;
      const nextDestination = activeInput === 'destination' ? coords : destination;

      if (activeInput === 'origin') setOrigin(suggestion.label, coords);
      else {
        setDestination(suggestion.label, coords);
        if (suggestion.entity_type === 'route') setActiveRouteId(String(suggestion.entity_id));
      }
      dismissSearchUi();

      let currentOrigin = nextOrigin;
      if (!currentOrigin && originLabel === 'Mi ubicación') {
        currentOrigin = await resolveCurrentOrigin();
      }

      if (currentOrigin && nextDestination) {
        await planJourneyWithCoords(currentOrigin, nextDestination);
      }
    },
    [
      activeInput,
      destination,
      dismissSearchUi,
      favorites,
      origin,
      originLabel,
      planJourneyWithCoords,
      resolveCurrentOrigin,
      setActiveRouteId,
      setDestination,
      setOrigin,
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
        setMessage('Activa el permiso de ubicación para ver paradas cercanas.');
        return;
      }
    }

    if (origin) {
      camera.current?.flyTo({center: [origin.longitude, origin.latitude], zoom: 16, duration: 700});
    }
    setMessage('Buscando tu ubicación…');

    try {
      const position = await getAccurateNativePosition(5000, 150, updatePosition => {
        const coordinates = {latitude: updatePosition.coords.latitude, longitude: updatePosition.coords.longitude};
        setOrigin('Mi ubicación', coordinates);
        camera.current?.flyTo({center: [coordinates.longitude, coordinates.latitude], zoom: 16, duration: 500});
      });
      const coordinates = {latitude: position.coords.latitude, longitude: position.coords.longitude};
      setOrigin('Mi ubicación', coordinates);
      camera.current?.flyTo({center: [coordinates.longitude, coordinates.latitude], zoom: 16, duration: 700});
      setMessage(`Ubicación actualizada (precisión ±${Math.round(position.coords.accuracy)} m)`);
    } catch (error) {
      if (__DEV__) console.warn('No precise GPS location available:', error);
      if (origin) {
        camera.current?.flyTo({center: [origin.longitude, origin.latitude], zoom: 16, duration: 700});
        setMessage('Mostrando última ubicación conocida.');
      } else {
        setMessage('La señal GPS no tiene suficiente precisión. Activa Ubicación precisa e inténtalo de nuevo.');
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
  };
}
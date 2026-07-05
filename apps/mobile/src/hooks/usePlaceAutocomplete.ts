import {
  buildPhotonSearchUrl,
  filterFavoriteSuggestions,
  mapPhotonFeatures,
  shouldShowFavoriteSuggestions,
} from '@rutas-morelia/transit-core';
import {useEffect, useMemo, useRef, useState} from 'react';
import {supabase} from '../lib/supabase';
import type {Coordinates} from '../store/transit-store';
import type {FavoriteItem, Suggestion} from '../types/transit';

type UsePlaceAutocompleteOptions = {
  activeInput: 'origin' | 'destination' | null;
  originLabel: string;
  destinationLabel: string;
  origin: Coordinates | null;
  destination: Coordinates | null;
  favoriteSuggestions: Suggestion[];
  favorites: FavoriteItem[];
};

export function usePlaceAutocomplete({
  activeInput,
  originLabel,
  destinationLabel,
  origin,
  destination,
  favoriteSuggestions,
  favorites,
}: UsePlaceAutocompleteOptions) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const suggestionCache = useRef(new Map<string, Suggestion[]>());

  const query = activeInput === 'origin' ? originLabel.trim() : destinationLabel.trim();
  const browsingFavorites = shouldShowFavoriteSuggestions(activeInput, query);

  useEffect(() => {
    const client = supabase;

    if (!client || !activeInput || browsingFavorites) {
      if (!browsingFavorites) setSuggestions([]);
      setLoading(false);
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
        const [localResult, remoteResult] = await Promise.allSettled([
          client.rpc('search_transit', {p_query: query, p_city_id: null, p_limit: 5, p_user_id: null}),
          client.functions.invoke('search-transit', {body: {query, limit: 5}}),
        ]);

        if (cancelled) return;

        let nextSuggestions: Suggestion[] = [];

        if (localResult.status === 'fulfilled' && !localResult.value.error && localResult.value.data) {
          const localSuggestions = (localResult.value.data as Suggestion[]).filter(
            item => item.entity_type !== 'route',
          );
          if (localSuggestions.length > 0) nextSuggestions = localSuggestions;
        }

        if (remoteResult.status === 'fulfilled' && !remoteResult.value.error) {
          const remoteSuggestions = (remoteResult.value.data?.data ?? []) as Suggestion[];
          if (remoteSuggestions.length > 0) nextSuggestions = remoteSuggestions;
        }

        if (nextSuggestions.length === 0) {
          try {
            const response = await fetch(buildPhotonSearchUrl(query, 10));
            if (response.ok) {
              const places = await response.json();
              nextSuggestions = mapPhotonFeatures(places.features);
            }
          } catch (fetchErr) {
            if (__DEV__) console.warn('Photon autocomplete query failed:', fetchErr);
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
        if (__DEV__) console.warn('Autocomplete query failed:', err);
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [activeInput, browsingFavorites, query]);

  const displayedSuggestions = useMemo(() => {
    if (!activeInput) return [];

    if (browsingFavorites) {
      return favoriteSuggestions;
    }

    const matchingFavs = filterFavoriteSuggestions(favorites, query);
    const deduped = suggestions.filter(
      item =>
        !matchingFavs.some(
          fav =>
            fav.label.toLowerCase() === item.label.toLowerCase() ||
            (fav.latitude != null &&
              item.latitude != null &&
              Math.abs(fav.latitude - item.latitude) < 0.0001 &&
              Math.abs((fav.longitude ?? 0) - (item.longitude ?? 0)) < 0.0001),
        ),
    );
    return [...matchingFavs, ...deduped];
  }, [activeInput, browsingFavorites, favoriteSuggestions, favorites, query, suggestions]);

  const clearSuggestions = () => setSuggestions([]);

  return {suggestions, displayedSuggestions, loading, clearSuggestions};
}
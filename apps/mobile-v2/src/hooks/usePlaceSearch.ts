import {
  favoritesToSuggestions,
  filterFavoriteSuggestions,
  shouldShowFavoriteSuggestions,
  type Suggestion,
} from '@rutas-morelia/transit-core';
import {useEffect, useMemo, useRef, useState} from 'react';
import {searchPlaces} from '../services/search.service';
import {supabase} from '../lib/supabase';
import {useFavoritesStore} from '../stores/favorites.store';
import {useTransitStore} from '../stores/transit.store';

export function usePlaceSearch() {
  const activeInput = useTransitStore(s => s.activeInput);
  const originLabel = useTransitStore(s => s.originLabel);
  const destinationLabel = useTransitStore(s => s.destinationLabel);
  const routes = useTransitStore(s => s.routes);
  const favorites = useFavoritesStore(s => s.favorites);
  const favoriteSuggestions = useMemo(() => favoritesToSuggestions(favorites), [favorites]);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const cache = useRef(new Map<string, Suggestion[]>());

  const query = activeInput === 'origin' ? originLabel.trim() : destinationLabel.trim();
  const browsingFavorites = shouldShowFavoriteSuggestions(activeInput, query);

  useEffect(() => {
    if (!activeInput || browsingFavorites) {
      if (!browsingFavorites) setSuggestions([]);
      setLoading(false);
      return;
    }

    const cacheKey = `${activeInput}:${query.toLocaleLowerCase('es-MX')}`;
    const cached = cache.current.get(cacheKey);
    if (cached) {
      setSuggestions(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const next = await searchPlaces(supabase, query, routes);
        if (cancelled) return;
        setSuggestions(next);
        cache.current.set(cacheKey, next);
        if (cache.current.size > 24) {
          const oldest = cache.current.keys().next().value;
          if (oldest) cache.current.delete(oldest);
        }
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [activeInput, browsingFavorites, query, routes]);

  const displayedSuggestions = useMemo(() => {
    if (!activeInput) return [];
    if (browsingFavorites) return favoriteSuggestions;

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

  return {displayedSuggestions, loading, browsingFavorites};
}
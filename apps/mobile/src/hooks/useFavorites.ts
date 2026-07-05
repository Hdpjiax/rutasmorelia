import AsyncStorage from '@react-native-async-storage/async-storage';
import type {User} from '@supabase/supabase-js';
import {
  createLocalPlaceFavorite,
  createLocalRouteFavorite,
  favoritesToSuggestions,
  isPlaceFavorited as isPlaceFavoritedCore,
  isRouteFavorited as isRouteFavoritedCore,
  LOCAL_FAVORITES_KEY,
  mergeLocalFavorites,
  removeFavoriteById,
} from '@rutas-morelia/transit-core';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {supabase} from '../lib/supabase';
import type {Coordinates} from '../store/transit-store';
import type {FavoriteItem} from '../types/transit';

async function persistLocalFavorites(favorites: FavoriteItem[]) {
  await AsyncStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(favorites));
}

export function useFavorites(setMessage: (msg: string) => void) {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    async function loadFavorites() {
      const client = supabase;
      let local: FavoriteItem[] = [];
      try {
        const stored = await AsyncStorage.getItem(LOCAL_FAVORITES_KEY);
        if (stored) local = JSON.parse(stored) as FavoriteItem[];
      } catch {}

      if (!client) {
        setFavorites(local);
        return;
      }

      try {
        const {
          data: {user: currentUser},
        } = await client.auth.getUser();
        setUser(currentUser);
        if (currentUser) {
          const {data, error} = await client.from('favorites').select('*').eq('user_id', currentUser.id);
          if (!error && data) {
            setFavorites(mergeLocalFavorites(data as FavoriteItem[], local));
            return;
          }
        }
      } catch {}
      setFavorites(local);
    }
    void loadFavorites();
  }, []);

  const removeFavorite = useCallback(
    async (existing: FavoriteItem, messages: {remote: string; local: string}) => {
      const client = supabase;
      if (client && user) {
        const {error} = await client.from('favorites').delete().eq('id', existing.id);
        if (!error) {
          setFavorites(prev => removeFavoriteById(prev, existing.id));
          setMessage(messages.remote);
        }
        return;
      }
      const updated = removeFavoriteById(favorites, existing.id);
      setFavorites(updated);
      await persistLocalFavorites(updated);
      setMessage(messages.local);
    },
    [favorites, setMessage, user],
  );

  const toggleFavoritePlace = useCallback(
    async (label: string, coords: Coordinates | null) => {
      if (!coords) return;
      const client = supabase;
      const existing = favorites.find(
        f => f.custom_name === label && (f.place_id != null || f.stop_id != null || f.latitude != null),
      );

      if (existing) {
        await removeFavorite(existing, {
          remote: 'Lugar eliminado de favoritos',
          local: 'Lugar eliminado de favoritos locales',
        });
        return;
      }

      if (client && user) {
        try {
          const {data: cityData} = await client.from('cities').select('id').eq('name', 'Morelia').limit(1);
          const cityId = cityData?.[0]?.id || 1;
          const {data: placeData, error: placeError} = await client
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
            const {data: favData, error: favError} = await client
              .from('favorites')
              .insert({user_id: user.id, place_id: placeData.id, custom_name: label})
              .select()
              .single();
            if (!favError && favData) {
              setFavorites(prev => [...prev, favData as FavoriteItem]);
              setMessage('Guardado en favoritos');
            }
          }
        } catch (e) {
          if (__DEV__) console.warn('Supabase favorite failed, saving locally:', e);
        }
        return;
      }

      const updated = [...favorites, createLocalPlaceFavorite(label, coords)];
      setFavorites(updated);
      await persistLocalFavorites(updated);
      setMessage('Guardado en favoritos locales');
    },
    [favorites, removeFavorite, setMessage, user],
  );

  const toggleRouteFavorite = useCallback(
    async (routeId: string) => {
      const client = supabase;
      const existing = favorites.find(f => String(f.route_id) === String(routeId));

      if (existing) {
        await removeFavorite(existing, {
          remote: 'Ruta eliminada de favoritos',
          local: 'Ruta eliminada de favoritos locales',
        });
        return;
      }

      if (client && user) {
        const {data, error} = await client
          .from('favorites')
          .insert({user_id: user.id, route_id: parseInt(routeId, 10)})
          .select()
          .single();
        if (!error && data) {
          setFavorites(prev => [...prev, data as FavoriteItem]);
          setMessage('Ruta guardada en favoritos');
        }
        return;
      }

      const updated = [...favorites, createLocalRouteFavorite(routeId)];
      setFavorites(updated);
      await persistLocalFavorites(updated);
      setMessage('Ruta guardada en favoritos locales');
    },
    [favorites, removeFavorite, setMessage, user],
  );

  const isPlaceFavorited = useCallback(
    (label: string) => isPlaceFavoritedCore(favorites, label),
    [favorites],
  );

  const isRouteFavorited = useCallback(
    (routeId: string) => isRouteFavoritedCore(favorites, routeId),
    [favorites],
  );

  const favoriteSuggestions = useMemo(
    () => favoritesToSuggestions(favorites),
    [favorites],
  );

  return {
    favorites,
    toggleFavoritePlace,
    toggleRouteFavorite,
    isPlaceFavorited,
    isRouteFavorited,
    favoriteSuggestions,
  };
}
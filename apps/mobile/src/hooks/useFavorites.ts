import AsyncStorage from '@react-native-async-storage/async-storage';
import type {User} from '@supabase/supabase-js';
import {
  createLocalPlaceFavorite,
  createLocalRouteFavorite,
  favoritesToSuggestions,
  findPlaceFavorite,
  findRouteFavorite,
  hydrateFavoriteCoords,
  isPlaceFavorited as isPlaceFavoritedCore,
  isRouteFavorited as isRouteFavoritedCore,
  LOCAL_FAVORITES_KEY,
  mergeLocalFavorites,
  removeFavoriteById,
} from '@rutas-morelia/transit-core';
import {useCallback, useEffect, useMemo, useState} from 'react';
import type {SetMessageFn} from './useToast';
import {supabase} from '../lib/supabase';
import type {Coordinates} from '../store/transit-store';
import type {FavoriteItem} from '../types/transit';

const FAVORITES_SELECT = '*, place:places(id, name, location), route:routes(id, code)';

async function persistLocalFavorites(favorites: FavoriteItem[]) {
  await AsyncStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(favorites));
}

async function readLocalFavorites(): Promise<FavoriteItem[]> {
  try {
    const stored = await AsyncStorage.getItem(LOCAL_FAVORITES_KEY);
    if (stored) return JSON.parse(stored) as FavoriteItem[];
  } catch {}
  return [];
}

export function useFavorites(setMessage: SetMessageFn) {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [user, setUser] = useState<User | null>(null);

  const loadFavorites = useCallback(async () => {
    const client = supabase;
    const local = await readLocalFavorites();

    if (!client) {
      setFavorites(hydrateFavoriteCoords(local));
      setUser(null);
      return;
    }

    try {
      const {
        data: {user: currentUser},
      } = await client.auth.getUser();
      setUser(currentUser);

      if (!currentUser) {
        setFavorites(hydrateFavoriteCoords(local));
        return;
      }

      const {data, error} = await client
        .from('favorites')
        .select(FAVORITES_SELECT)
        .eq('user_id', currentUser.id);

      if (!error && data) {
        setFavorites(
          hydrateFavoriteCoords(mergeLocalFavorites(data as FavoriteItem[], local)),
        );
        return;
      }
    } catch {}

    setFavorites(hydrateFavoriteCoords(local));
  }, []);

  useEffect(() => {
    void loadFavorites();

    const client = supabase;
    if (!client) return;

    const {
      data: {subscription},
    } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      void loadFavorites();
    });

    return () => subscription.unsubscribe();
  }, [loadFavorites]);

  const removeFavorite = useCallback(
    async (existing: FavoriteItem, messages: {remote: string; local: string}) => {
      const client = supabase;
      const updated = removeFavoriteById(favorites, existing.id);
      setFavorites(updated);
      await persistLocalFavorites(updated);

      if (client && user && !existing.is_local) {
        const {error} = await client.from('favorites').delete().eq('id', existing.id);
        if (!error) {
          setMessage(messages.remote, 'success');
          return;
        }
      }

      setMessage(messages.local, 'success');
    },
    [favorites, setMessage, user],
  );

  const toggleFavoritePlace = useCallback(
    async (label: string, coords: Coordinates | null) => {
      const trimmed = label.trim();
      if (!coords || !trimmed) {
        setMessage('Primero elige un lugar con coordenadas válidas.', 'error');
        return;
      }

      const client = supabase;
      const existing = findPlaceFavorite(favorites, trimmed);

      if (existing) {
        await removeFavorite(existing, {
          remote: 'Lugar eliminado de favoritos',
          local: 'Lugar eliminado de favoritos locales',
        });
        return;
      }

      const localFavorite = createLocalPlaceFavorite(trimmed, coords);
      let nextFavorite: FavoriteItem = localFavorite;
      const optimistic = [...favorites, localFavorite];
      setFavorites(optimistic);
      await persistLocalFavorites(optimistic);

      if (client && user) {
        try {
          const {data: cityData} = await client.from('cities').select('id').eq('name', 'Morelia').limit(1);
          const cityId = cityData?.[0]?.id || 1;
          const {data: placeData, error: placeError} = await client
            .from('places')
            .insert({
              city_id: cityId,
              name: trimmed,
              category: 'Favorito',
              address: 'Morelia, Michoacán',
              location: `POINT(${coords.longitude} ${coords.latitude})`,
            })
            .select('id')
            .single();

          if (!placeError && placeData) {
            const {data: favData, error: favError} = await client
              .from('favorites')
              .insert({user_id: user.id, place_id: placeData.id, custom_name: trimmed})
              .select(FAVORITES_SELECT)
              .single();
            if (!favError && favData) {
              nextFavorite = {
                ...(favData as FavoriteItem),
                latitude: coords.latitude,
                longitude: coords.longitude,
              };
              const synced = removeFavoriteById(optimistic, localFavorite.id);
              const updated = [...synced, nextFavorite];
              setFavorites(updated);
              await persistLocalFavorites(updated);
              setMessage('Guardado en favoritos', 'success');
              return;
            }
          }
        } catch (e) {
          if (__DEV__) console.warn('Supabase favorite failed, keeping local copy:', e);
        }
      }

      setMessage('Guardado en favoritos', 'success');
    },
    [favorites, removeFavorite, setMessage, user],
  );

  const toggleRouteFavorite = useCallback(
    async (routeId: string) => {
      const client = supabase;
      const existing = findRouteFavorite(favorites, routeId);

      if (existing) {
        await removeFavorite(existing, {
          remote: 'Ruta eliminada de favoritos',
          local: 'Ruta eliminada de favoritos locales',
        });
        return;
      }

      if (client && user) {
        const {data: routeData} = await client.from('routes').select('id, code').eq('code', String(routeId)).limit(1);
        const dbRouteId = routeData?.[0]?.id;
        if (dbRouteId) {
          const {data, error} = await client
            .from('favorites')
            .insert({user_id: user.id, route_id: dbRouteId})
            .select(FAVORITES_SELECT)
            .single();
          if (!error && data) {
            const updated = [...favorites, data as FavoriteItem];
            setFavorites(updated);
            await persistLocalFavorites(updated);
            setMessage('Ruta guardada en favoritos', 'success');
            return;
          }
        }
      }

      const updated = [...favorites, createLocalRouteFavorite(routeId)];
      setFavorites(updated);
      await persistLocalFavorites(updated);
      setMessage('Ruta guardada en favoritos locales', 'info');
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

  const placeFavorites = useMemo(
    () => favorites.filter(f => f.place_id || f.stop_id || f.latitude != null || f.place?.location),
    [favorites],
  );

  return {
    favorites,
    placeFavorites,
    toggleFavoritePlace,
    toggleRouteFavorite,
    isPlaceFavorited,
    isRouteFavorited,
    favoriteSuggestions,
    reloadFavorites: loadFavorites,
  };
}
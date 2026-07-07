import {
  createLocalPlaceFavorite,
  createLocalRouteFavorite,
  findPlaceFavorite,
  findRouteFavorite,
  hydrateFavoriteCoords,
  LOCAL_FAVORITES_KEY,
  mergeLocalFavorites,
  removeFavoriteById,
  type FavoriteItem,
} from '@rutas-morelia/transit-core';
import type {Coordinates} from '@rutas-morelia/transit-core';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {KeyValueStorage} from './storage/storage.interface';

const FAVORITES_SELECT = '*, place:places(id, name, location), route:routes(id, code)';

export async function readLocalFavorites(storage: KeyValueStorage): Promise<FavoriteItem[]> {
  try {
    const stored = await storage.getItem(LOCAL_FAVORITES_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as FavoriteItem[];
  } catch {
    return [];
  }
}

export async function persistLocalFavorites(storage: KeyValueStorage, favorites: FavoriteItem[]): Promise<void> {
  await storage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(favorites));
}

export async function loadFavorites(
  storage: KeyValueStorage,
  client: SupabaseClient | null,
): Promise<FavoriteItem[]> {
  const local = await readLocalFavorites(storage);
  if (!client) return hydrateFavoriteCoords(local);

  try {
    const {data: {user}} = await client.auth.getUser();
    if (!user) return hydrateFavoriteCoords(local);

    const {data, error} = await client
      .from('favorites')
      .select(FAVORITES_SELECT)
      .eq('user_id', user.id);

    if (!error && data) {
      return hydrateFavoriteCoords(mergeLocalFavorites(data as FavoriteItem[], local));
    }
  } catch {
    // use local
  }

  return hydrateFavoriteCoords(local);
}

export function toggleRouteFavoriteLocal(favorites: FavoriteItem[], routeId: string): FavoriteItem[] {
  const existing = findRouteFavorite(favorites, routeId);
  if (existing) return removeFavoriteById(favorites, existing.id);
  return [...favorites, createLocalRouteFavorite(routeId)];
}

export function togglePlaceFavoriteLocal(
  favorites: FavoriteItem[],
  label: string,
  coords: Coordinates,
): FavoriteItem[] {
  const existing = findPlaceFavorite(favorites, label);
  if (existing) return removeFavoriteById(favorites, existing.id);
  return [...favorites, createLocalPlaceFavorite(label, coords)];
}
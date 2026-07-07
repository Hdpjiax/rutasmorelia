import {favoritesToSuggestions, type FavoriteItem} from '@rutas-morelia/transit-core';
import {create} from 'zustand';
import {asyncStorageAdapter} from '../services/storage/async-storage.adapter';
import {
  loadFavorites,
  persistLocalFavorites,
  togglePlaceFavoriteLocal,
  toggleRouteFavoriteLocal,
} from '../services/favorites.service';
import {supabase} from '../lib/supabase';
import type {Coordinates} from '@rutas-morelia/transit-core';

type FavoritesState = {
  favorites: FavoriteItem[];
  loading: boolean;
  hydrate: () => Promise<void>;
  toggleRoute: (routeId: string) => Promise<void>;
  togglePlace: (label: string, coords: Coordinates | null) => Promise<void>;
  favoriteSuggestions: () => ReturnType<typeof favoritesToSuggestions>;
};

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favorites: [],
  loading: true,
  hydrate: async () => {
    set({loading: true});
    const favorites = await loadFavorites(asyncStorageAdapter, supabase);
    set({favorites, loading: false});
  },
  toggleRoute: async routeId => {
    const updated = toggleRouteFavoriteLocal(get().favorites, routeId);
    set({favorites: updated});
    await persistLocalFavorites(asyncStorageAdapter, updated);
  },
  togglePlace: async (label, coords) => {
    if (!coords) return;
    const updated = togglePlaceFavoriteLocal(get().favorites, label, coords);
    set({favorites: updated});
    await persistLocalFavorites(asyncStorageAdapter, updated);
  },
  favoriteSuggestions: () => favoritesToSuggestions(get().favorites),
}));
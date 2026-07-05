import {describe, expect, it} from 'vitest';
import {
  createLocalPlaceFavorite,
  DEFAULT_ORIGIN_LABEL,
  favoritesToSuggestions,
  filterFavoriteSuggestions,
  isPlaceFavorited,
  isRouteFavorited,
  mergeLocalFavorites,
  shouldShowFavoriteSuggestions,
} from '../favorites';
import type {FavoriteItem} from '../types';

describe('favorites', () => {
  it('merges local favorites without duplicates', () => {
    const remote: FavoriteItem[] = [{id: 1, route_id: 10, custom_name: 'Casa'}];
    const local: FavoriteItem[] = [
      {id: 'local_1', route_id: 11, custom_name: 'Trabajo'},
      {id: 'local_2', route_id: 10, custom_name: 'Casa'},
    ];
    const merged = mergeLocalFavorites(remote, local);
    expect(merged).toHaveLength(2);
  });

  it('detects favorited routes and places', () => {
    const favorites: FavoriteItem[] = [
      {id: 1, route_id: 5},
      {id: 2, custom_name: 'Mercado', latitude: 19.7, longitude: -101.2},
    ];
    expect(isRouteFavorited(favorites, '5')).toBe(true);
    expect(isPlaceFavorited(favorites, 'Mercado')).toBe(true);
  });

  it('maps favorites to suggestions and filters by query', () => {
    const favorites: FavoriteItem[] = [
      createLocalPlaceFavorite('Universidad', {latitude: 19.7, longitude: -101.2}),
    ];
    const suggestions = favoritesToSuggestions(favorites);
    expect(suggestions[0]?.label).toBe('Universidad');

    const filtered = filterFavoriteSuggestions(favorites, 'univ');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.subtitle).toBe('Dirección favorita guardada');
  });

  it('shows favorite suggestions before typing or with default origin label', () => {
    expect(shouldShowFavoriteSuggestions('destination', '')).toBe(true);
    expect(shouldShowFavoriteSuggestions('origin', DEFAULT_ORIGIN_LABEL)).toBe(true);
    expect(shouldShowFavoriteSuggestions('origin', 'Centro Histórico')).toBe(false);
  });
});
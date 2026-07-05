import {parseLocationField} from './places';
import type {Coordinates, FavoriteItem, Suggestion} from './types';

export const DEFAULT_ORIGIN_LABEL = 'Mi ubicación';

export function shouldShowFavoriteSuggestions(
  activeInput: 'origin' | 'destination' | null,
  query: string,
): boolean {
  if (!activeInput) return false;
  const trimmed = query.trim();
  return trimmed.length < 2 || (activeInput === 'origin' && trimmed === DEFAULT_ORIGIN_LABEL);
}

export function hydrateFavoriteCoords(favorites: FavoriteItem[]): FavoriteItem[] {
  return favorites.map(favorite => {
    if (favorite.latitude != null && favorite.longitude != null) return favorite;
    const coords = favoriteCoords(favorite);
    if (!coords) return favorite;
    return {...favorite, latitude: coords.latitude, longitude: coords.longitude};
  });
}

export function favoriteCoords(favorite: FavoriteItem): Coordinates | null {
  if (favorite.latitude != null && favorite.longitude != null) {
    return {latitude: favorite.latitude, longitude: favorite.longitude};
  }

  const fromPlace = parseLocationField(favorite.place?.location as Parameters<typeof parseLocationField>[0]);
  if (fromPlace) return fromPlace;

  return null;
}

export function findRouteFavorite(
  favorites: FavoriteItem[],
  routeId: string | number,
): FavoriteItem | undefined {
  const code = String(routeId);
  return favorites.find(
    f =>
      (f.route?.code != null && String(f.route.code) === code) ||
      (f.route_id != null && String(f.route_id) === code),
  );
}

export function findPlaceFavorite(
  favorites: FavoriteItem[],
  label: string,
): FavoriteItem | undefined {
  return favorites.find(
    f =>
      f.custom_name === label ||
      f.place?.name === label ||
      f.name === label,
  );
}

export function findFavoriteBySuggestion(
  favorites: FavoriteItem[],
  suggestion: Suggestion,
): FavoriteItem | undefined {
  const entityId = suggestion.entity_id;

  if (typeof entityId === 'number' || typeof entityId === 'string') {
    const byPlaceId = favorites.find(f => f.place_id != null && String(f.place_id) === String(entityId));
    if (byPlaceId) return byPlaceId;

    const byStopId = favorites.find(f => f.stop_id != null && String(f.stop_id) === String(entityId));
    if (byStopId) return byStopId;

    const byFavoriteId = favorites.find(f => String(f.id) === String(entityId));
    if (byFavoriteId) return byFavoriteId;
  }

  return findPlaceFavorite(favorites, suggestion.label);
}

export function isRouteFavorited(
  favorites: FavoriteItem[],
  routeId: string | number,
): boolean {
  return findRouteFavorite(favorites, routeId) != null;
}

export function isPlaceFavorited(favorites: FavoriteItem[], label: string): boolean {
  return favorites.some(
    f =>
      Boolean(f.place_id || f.stop_id || f.latitude != null) &&
      (f.custom_name === label || f.place?.name === label || f.name === label),
  );
}

export function createLocalRouteFavorite(routeId: string | number): FavoriteItem {
  const parsed = typeof routeId === 'number' ? routeId : parseInt(String(routeId), 10);
  return {
    id: `local_${Date.now()}`,
    route_id: Number.isNaN(parsed) ? routeId : parsed,
    is_local: true,
  };
}

export function createLocalPlaceFavorite(label: string, coords: Coordinates): FavoriteItem {
  return {
    id: `local_${Date.now()}`,
    custom_name: label,
    latitude: coords.latitude,
    longitude: coords.longitude,
    is_local: true,
  };
}

export function mergeLocalFavorites(
  remote: FavoriteItem[],
  local: FavoriteItem[],
): FavoriteItem[] {
  const merged = [...remote];
  for (const favorite of local) {
    if (
      !merged.some(
        item =>
          item.custom_name === favorite.custom_name &&
          item.route_id === favorite.route_id,
      )
    ) {
      merged.push(favorite);
    }
  }
  return merged;
}

export function removeFavoriteById(
  favorites: FavoriteItem[],
  id: string | number,
): FavoriteItem[] {
  return favorites.filter(f => f.id !== id);
}

export function favoritesToSuggestions(favorites: FavoriteItem[]): Suggestion[] {
  return favorites
    .filter(f => f.place_id || f.stop_id || f.latitude != null || f.place?.location)
    .map(fav => {
      const coords = favoriteCoords(fav);
      return {
        entity_type: fav.stop_id ? 'stop' : 'place',
        entity_id: fav.place_id || fav.stop_id || fav.id,
        label: fav.custom_name || fav.place?.name || fav.name || '',
        subtitle: fav.stop_id ? 'Parada favorita' : 'Lugar favorito',
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
      };
    })
    .filter(s => s.latitude != null && s.longitude != null);
}

export function filterFavoriteSuggestions(
  favorites: FavoriteItem[],
  query: string,
  minLength = 2,
): Suggestion[] {
  const trimmed = query.trim();
  if (trimmed.length < minLength) return [];

  const normQuery = trimmed.toLowerCase();
  return favorites
    .filter(f => f.place_id || f.latitude != null || f.custom_name || f.place?.location)
    .map(fav => {
      const label = fav.custom_name || fav.place?.name || 'Lugar favorito';
      const coords = favoriteCoords(fav);
      return {
        entity_type: 'place',
        entity_id: fav.place_id || fav.stop_id || fav.id,
        label,
        subtitle: 'Dirección favorita guardada',
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
      } satisfies Suggestion;
    })
    .filter(suggestion => suggestion.latitude != null && suggestion.longitude != null)
    .filter(suggestion => suggestion.label.toLowerCase().includes(normQuery));
}
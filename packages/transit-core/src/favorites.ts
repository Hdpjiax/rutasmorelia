import type {Coordinates, FavoriteItem, Suggestion} from './types';

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
    .filter(f => f.place_id || f.stop_id || f.latitude != null)
    .map(fav => ({
      entity_type: fav.stop_id ? 'stop' : 'place',
      entity_id: fav.stop_id || fav.place_id || 999999,
      label: fav.custom_name || fav.place?.name || fav.name || '',
      subtitle: fav.stop_id ? 'Parada favorita' : 'Lugar favorito',
      latitude:
        fav.latitude ?? fav.place?.location?.coordinates?.[1] ?? null,
      longitude:
        fav.longitude ?? fav.place?.location?.coordinates?.[0] ?? null,
    }));
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
    .filter(f => f.place_id || f.latitude != null || f.custom_name)
    .map(fav => {
      const label = fav.custom_name || fav.place?.name || 'Lugar favorito';
      const latitude =
        fav.latitude ?? fav.place?.location?.coordinates?.[1] ?? null;
      const longitude =
        fav.longitude ?? fav.place?.location?.coordinates?.[0] ?? null;
      return {
        entity_type: 'place',
        entity_id: fav.id,
        label,
        subtitle: 'Dirección favorita guardada',
        latitude,
        longitude,
      } satisfies Suggestion;
    })
    .filter(suggestion => suggestion.label.toLowerCase().includes(normQuery));
}
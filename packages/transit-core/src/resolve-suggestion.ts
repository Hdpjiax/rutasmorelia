import {favoriteCoords, findFavoriteBySuggestion} from './favorites';
import {parseLocationField} from './places';
import type {Coordinates, FavoriteItem, Suggestion} from './types';

export type LocationField = Parameters<typeof parseLocationField>[0];

export interface TransitDataClient {
  fetchStopLocation(stopId: number | string): Promise<LocationField>;
  fetchPlaceLocation(placeId: number | string): Promise<LocationField>;
}

export async function resolveSuggestionCoords(
  client: TransitDataClient | null,
  suggestion: Suggestion,
  favorites: FavoriteItem[] = [],
): Promise<Coordinates | null> {
  const {latitude: lat, longitude: lon} = suggestion;
  if (lat !== null && lon !== null && !(lat === 0 && lon === 0)) {
    return {latitude: lat, longitude: lon};
  }

  const favorite = findFavoriteBySuggestion(favorites, suggestion);
  if (favorite) {
    const coords = favoriteCoords(favorite);
    if (coords) return coords;
  }

  if (!client) return null;

  const placeId =
    favorite?.place_id ??
    (suggestion.entity_type === 'place' ? suggestion.entity_id : null);
  const stopId =
    favorite?.stop_id ??
    (suggestion.entity_type === 'stop' ? suggestion.entity_id : null);

  try {
    if (stopId != null) {
      const location = await client.fetchStopLocation(stopId);
      return parseLocationField(location);
    }
    if (placeId != null) {
      const location = await client.fetchPlaceLocation(placeId);
      return parseLocationField(location);
    }
  } catch {
    return null;
  }

  return null;
}
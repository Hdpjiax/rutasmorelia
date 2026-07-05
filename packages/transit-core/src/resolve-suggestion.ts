import {parseLocationField} from './places';
import type {Coordinates, FavoriteItem, Suggestion} from './types';

export type LocationField = Parameters<typeof parseLocationField>[0];

export interface TransitDataClient {
  fetchStopLocation(stopId: number | string): Promise<LocationField>;
  fetchPlaceLocation(placeId: number | string): Promise<LocationField>;
}

const LOCAL_FAVORITE_ENTITY_ID = 999999;

export async function resolveSuggestionCoords(
  client: TransitDataClient | null,
  suggestion: Suggestion,
  favorites: FavoriteItem[] = [],
): Promise<Coordinates | null> {
  const {latitude: lat, longitude: lon} = suggestion;
  if (lat !== null && lon !== null) {
    return {latitude: lat, longitude: lon};
  }

  if (suggestion.entity_id === LOCAL_FAVORITE_ENTITY_ID) {
    const localFavorite = favorites.find(
      f => f.custom_name === suggestion.label || f.name === suggestion.label,
    );
    if (
      localFavorite?.latitude != null &&
      localFavorite?.longitude != null
    ) {
      return {
        latitude: localFavorite.latitude,
        longitude: localFavorite.longitude,
      };
    }
    return null;
  }

  if (!client) return null;

  try {
    const location =
      suggestion.entity_type === 'stop'
        ? await client.fetchStopLocation(suggestion.entity_id)
        : await client.fetchPlaceLocation(suggestion.entity_id);
    return parseLocationField(location);
  } catch {
    return null;
  }
}
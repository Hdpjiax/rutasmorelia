import {
  parseLocationField,
  resolveSuggestionCoords as resolveSuggestionCoordsCore,
  type Coordinates,
  type FavoriteItem,
  type Suggestion,
  type TransitDataClient,
} from '@rutas-morelia/transit-core';
import type {SupabaseClient} from '@supabase/supabase-js';

export {buildPhotonSearchUrl, mapPhotonFeatures, parseLocationField} from '@rutas-morelia/transit-core';

function createSupabaseDataClient(client: SupabaseClient): TransitDataClient {
  return {
    async fetchStopLocation(stopId) {
      const {data} = await client.from('stops').select('location').eq('id', stopId).single();
      return data?.location as Parameters<typeof parseLocationField>[0];
    },
    async fetchPlaceLocation(placeId) {
      const {data} = await client.from('places').select('location').eq('id', placeId).single();
      return data?.location as Parameters<typeof parseLocationField>[0];
    },
  };
}

export async function resolveSuggestionCoords(
  client: SupabaseClient | null,
  suggestion: Suggestion,
  favorites: FavoriteItem[] = [],
): Promise<Coordinates | null> {
  const dataClient = client ? createSupabaseDataClient(client) : null;
  try {
    return await resolveSuggestionCoordsCore(dataClient, suggestion, favorites);
  } catch {
    return null;
  }
}

export async function searchPlaceByName(
  client: SupabaseClient,
  name: string,
): Promise<{name: string; coords: Coordinates} | null> {
  try {
    const {data} = await client
      .from('places')
      .select('name, location')
      .ilike('name', `%${name.trim()}%`)
      .limit(1);
    const firstPlace = data?.[0];
    if (!firstPlace) return null;
    const coords = parseLocationField(firstPlace.location as Parameters<typeof parseLocationField>[0]);
    if (!coords) return null;
    return {name: firstPlace.name, coords};
  } catch {
    return null;
  }
}
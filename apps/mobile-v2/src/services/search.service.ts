import {
  buildPhotonSearchUrl,
  expandSearchQuery,
  isWithinMoreliaMetro,
  mapPhotonFeatures,
  scoreRoutesByQuery,
  type RouteItem,
  type Suggestion,
} from '@rutas-morelia/transit-core';
import type {SupabaseClient} from '@supabase/supabase-js';

export type SearchTransitClient = Pick<SupabaseClient, 'rpc' | 'functions'>;

const PLACE_SEARCH_LIMIT = 25;

function moreliaScopedQuery(query: string): string {
  const lower = query.toLocaleLowerCase('es-MX');
  if (lower.includes('morelia') || lower.includes('michoac')) return query;
  return `${query}, Morelia`;
}

function dedupeSuggestions(items: Suggestion[]): Suggestion[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = `${item.entity_type}:${item.entity_id}:${item.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function filterPhotonSuggestions(suggestions: Suggestion[]): Suggestion[] {
  return suggestions.filter(item => {
    if (item.entity_type === 'route') return true;
    if (item.latitude == null || item.longitude == null) return true;
    if (!String(item.entity_id).startsWith('photon-')) return true;
    return isWithinMoreliaMetro({latitude: item.latitude, longitude: item.longitude});
  });
}

function placesOnly(suggestions: Suggestion[]): Suggestion[] {
  return suggestions.filter(item => item.entity_type !== 'route' && item.label.trim().length > 0);
}

export async function searchTransitRemote(
  client: SearchTransitClient,
  query: string,
  limit = PLACE_SEARCH_LIMIT,
): Promise<Suggestion[]> {
  const scopedQuery = moreliaScopedQuery(query);
  const variants = expandSearchQuery(scopedQuery);

  for (const variant of variants) {
    const merged: Suggestion[] = [];

    const [edgeResult, rpcResult] = await Promise.allSettled([
      client.functions.invoke('search-transit', {
        body: {query: variant, limit, city_id: null},
      }),
      client.rpc('search_transit', {
        p_query: variant,
        p_city_id: null,
        p_limit: limit,
        p_user_id: null,
      }),
    ]);

    if (edgeResult.status === 'fulfilled' && !edgeResult.value.error) {
      merged.push(...(((edgeResult.value.data?.data ?? []) as Suggestion[]) || []));
    }

    if (rpcResult.status === 'fulfilled' && !rpcResult.value.error && rpcResult.value.data) {
      merged.push(...(rpcResult.value.data as Suggestion[]));
    }

    const places = placesOnly(dedupeSuggestions(merged));
    if (places.length > 0) return places;
  }

  return [];
}

export async function searchPhotonFallback(query: string, limit = 15): Promise<Suggestion[]> {
  const response = await fetch(buildPhotonSearchUrl(moreliaScopedQuery(query), limit));
  if (!response.ok) return [];
  const payload = await response.json();
  return filterPhotonSuggestions(mapPhotonFeatures(payload.features));
}

export function searchRoutesLocally(routes: RouteItem[], query: string): Suggestion[] {
  return scoreRoutesByQuery(routes, query).map(route => ({
    entity_type: 'route',
    entity_id: route.id,
    label: route.name,
    subtitle: `${route.number} · ${route.detail}`,
    latitude: null,
    longitude: null,
  }));
}

export async function searchPlaces(
  client: SearchTransitClient | null,
  query: string,
  _routes: RouteItem[] = [],
  limit = PLACE_SEARCH_LIMIT,
): Promise<Suggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  if (client) {
    try {
      const remote = await searchTransitRemote(client, trimmed, limit);
      if (remote.length > 0) return remote;
    } catch {
      // fall through to photon
    }
  }

  try {
    const photon = await searchPhotonFallback(trimmed, 15);
    if (photon.length > 0) return photon;
  } catch {
    // no results
  }

  return [];
}
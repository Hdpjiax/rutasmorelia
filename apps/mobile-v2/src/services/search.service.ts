import {
  buildPhotonSearchUrl,
  mapPhotonFeatures,
  scoreRoutesByQuery,
  type RouteItem,
  type Suggestion,
} from '@rutas-morelia/transit-core';
import type {SupabaseClient} from '@supabase/supabase-js';

export type SearchTransitClient = Pick<SupabaseClient, 'rpc' | 'functions'>;

export async function searchTransitRemote(
  client: SearchTransitClient,
  query: string,
  limit = 5,
): Promise<Suggestion[]> {
  const [localResult, remoteResult] = await Promise.allSettled([
    client.rpc('search_transit', {p_query: query, p_city_id: null, p_limit: limit, p_user_id: null}),
    client.functions.invoke('search-transit', {body: {query, limit}}),
  ]);

  if (localResult.status === 'fulfilled' && !localResult.value.error && localResult.value.data) {
    const localSuggestions = (localResult.value.data as Suggestion[]).filter(item => item.entity_type !== 'route');
    if (localSuggestions.length > 0) return localSuggestions;
  }

  if (remoteResult.status === 'fulfilled' && !remoteResult.value.error) {
    const remoteSuggestions = (remoteResult.value.data?.data ?? []) as Suggestion[];
    if (remoteSuggestions.length > 0) return remoteSuggestions;
  }

  return [];
}

export async function searchPhotonFallback(query: string, limit = 10): Promise<Suggestion[]> {
  const response = await fetch(buildPhotonSearchUrl(query, limit));
  if (!response.ok) return [];
  const payload = await response.json();
  return mapPhotonFeatures(payload.features);
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
  routes: RouteItem[] = [],
  limit = 5,
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
    const photon = await searchPhotonFallback(trimmed, 10);
    if (photon.length > 0) return photon;
  } catch {
    // fall through to local routes
  }

  return searchRoutesLocally(routes, trimmed);
}
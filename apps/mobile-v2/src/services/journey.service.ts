import {
  haversineDistanceKm,
  selectInitialJourneyRouteId,
  type Coordinates,
  type JourneyOption,
  type RouteItem,
} from '@rutas-morelia/transit-core';
import type {SupabaseClient} from '@supabase/supabase-js';
import {FALLBACK_ROUTES} from './routes.service';

export type JourneyClient = Pick<SupabaseClient, 'functions'>;

export type PlanJourneyResult = {
  options: JourneyOption[];
  error: string | null;
  fromFallback: boolean;
};

export function effectiveRouteCatalog(catalog: RouteItem[]): RouteItem[] {
  return catalog.length > 0 ? catalog : FALLBACK_ROUTES;
}

export function resolveJourneyRouteCatalogId(
  routeRef: string | number | null | undefined,
  catalog: RouteItem[],
): string | null {
  if (routeRef == null || routeRef === '') return null;
  const pool = effectiveRouteCatalog(catalog);
  const candidate = String(routeRef);

  const exact = pool.find(route => route.id === candidate);
  if (exact) return exact.id;

  const digits = candidate.replace(/\D/g, '');
  if (digits) {
    const byDigits = pool.find(route => route.id === digits);
    if (byDigits) return byDigits.id;
  }

  const byNumber = pool.find(route => route.number === candidate);
  if (byNumber) return byNumber.id;

  return null;
}

export function resolveJourneyOptionCatalogId(
  option: JourneyOption,
  catalog: RouteItem[],
): string | null {
  return (
    resolveJourneyRouteCatalogId(option.route_id, catalog) ??
    resolveJourneyRouteCatalogId(option.route_code, catalog)
  );
}

export function resolveActiveRouteIdFromJourney(
  options: JourneyOption[],
  catalog: RouteItem[],
): string | null {
  const raw = selectInitialJourneyRouteId(options);
  if (!raw) return null;
  return resolveJourneyRouteCatalogId(raw, catalog);
}

export function pickFallbackRoute(
  origin: Coordinates,
  destination: Coordinates,
  catalog: RouteItem[] = FALLBACK_ROUTES,
): RouteItem {
  const pool = effectiveRouteCatalog(catalog);
  if (pool.length === 1) return pool[0];

  const ranked = [...pool].sort((a, b) => {
    const score = (route: RouteItem) => {
      const id = Number.parseInt(route.id, 10);
      return Number.isFinite(id) ? id : 0;
    };
    return score(a) - score(b);
  });

  const distanceKm = haversineDistanceKm(
    origin.latitude,
    origin.longitude,
    destination.latitude,
    destination.longitude,
  );
  const index = Math.min(ranked.length - 1, Math.floor(distanceKm * 2) % ranked.length);
  return ranked[index] ?? FALLBACK_ROUTES[0];
}

export function buildFallbackJourneyOptions(
  origin: Coordinates,
  destination: Coordinates,
  catalog: RouteItem[] = FALLBACK_ROUTES,
): JourneyOption[] {
  const route = pickFallbackRoute(origin, destination, catalog);
  const walkMeters = Math.round(
    haversineDistanceKm(origin.latitude, origin.longitude, destination.latitude, destination.longitude) * 400,
  );
  return [
    {
      route_id: route.id,
      route_code: route.number,
      route_name: route.name,
      route_color: route.color,
      origin_walk_meters: Math.min(walkMeters, 600),
      destination_walk_meters: Math.min(Math.round(walkMeters * 0.6), 400),
      boarding_stop_name: 'Parada cercana (estimada)',
      alighting_stop_name: 'Parada destino (estimada)',
      transfers: 0,
    },
  ];
}

export async function planJourney(
  client: JourneyClient | null,
  origin: Coordinates,
  destination: Coordinates,
  catalog: RouteItem[] = FALLBACK_ROUTES,
): Promise<PlanJourneyResult> {
  const pool = effectiveRouteCatalog(catalog);

  if (!client) {
    return {
      options: buildFallbackJourneyOptions(origin, destination, pool),
      error: null,
      fromFallback: true,
    };
  }

  try {
    const {data, error} = await client.functions.invoke('plan-journey', {
      body: {origin, destination},
    });
    const options = (data?.data ?? []) as JourneyOption[];
    if (error || !options.length) {
      return {
        options: buildFallbackJourneyOptions(origin, destination, pool),
        error: null,
        fromFallback: true,
      };
    }
    return {options, error: null, fromFallback: false};
  } catch {
    return {
      options: buildFallbackJourneyOptions(origin, destination, pool),
      error: null,
      fromFallback: true,
    };
  }
}
import {
  selectInitialJourneyRouteId,
  type FavoriteItem,
  type JourneyOption,
  type RouteItem,
} from '@rutas-morelia/transit-core';
import {FALLBACK_ROUTES} from './routes.service';

export function effectiveRouteCatalog(catalog: RouteItem[]): RouteItem[] {
  return catalog.length > 0 ? catalog : FALLBACK_ROUTES;
}

export function resolveRouteCatalogId(
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

export function resolveFavoriteRouteCatalogId(
  favorite: FavoriteItem,
  catalog: RouteItem[],
): string | null {
  const candidates = [favorite.route_id, favorite.route?.id, favorite.route?.code]
    .filter(value => value != null)
    .map(value => String(value));

  for (const candidate of candidates) {
    const id = resolveRouteCatalogId(candidate, catalog);
    if (id) return id;
  }

  return null;
}

export function resolveJourneyOptionCatalogId(
  option: JourneyOption,
  catalog: RouteItem[],
): string | null {
  return (
    resolveRouteCatalogId(option.route_id, catalog) ??
    resolveRouteCatalogId(option.route_code, catalog)
  );
}

export function resolveActiveRouteIdFromJourney(
  options: JourneyOption[],
  catalog: RouteItem[],
): string | null {
  const raw = selectInitialJourneyRouteId(options);
  if (!raw) return null;
  return resolveRouteCatalogId(raw, catalog);
}
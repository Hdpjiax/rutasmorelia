import {GEOMETRY_CACHE_PREFIX, selectInitialJourneyRouteId, type Coordinates} from '@rutas-morelia/transit-core';
import {geometryCacheKey} from '../src/services/geometry.service';
import {
  effectiveRouteCatalog,
  planJourney,
  resolveActiveRouteIdFromJourney,
  resolveJourneyOptionCatalogId,
  resolveJourneyRouteCatalogId,
} from '../src/services/journey.service';
import {FALLBACK_ROUTES} from '../src/services/routes.service';

const origin: Coordinates = {latitude: 19.7027, longitude: -101.1944};
const destination: Coordinates = {latitude: 19.71, longitude: -101.18};

describe('plan journey flow (integrated)', () => {
  it('empty store catalog uses FALLBACK_ROUTES and yields valid route_id', async () => {
    const catalog = effectiveRouteCatalog([]);
    expect(catalog).toEqual(FALLBACK_ROUTES);

    const result = await planJourney(null, origin, destination, catalog);
    expect(result.options[0].route_id).toBeTruthy();
    expect(FALLBACK_ROUTES.some(route => route.id === String(result.options[0].route_id))).toBe(true);
  });

  it('selectInitialJourneyRouteId returns display code but resolveActiveRouteIdFromJourney maps to catalog id', async () => {
    const singleRoute = [FALLBACK_ROUTES[0]];
    const result = await planJourney(null, origin, destination, singleRoute);
    const raw = selectInitialJourneyRouteId(result.options);
    expect(raw).toBe('A78');

    const catalogId = resolveActiveRouteIdFromJourney(result.options, singleRoute);
    expect(catalogId).toBe('78');
    expect(catalogId).not.toBe(raw);
  });

  it('resolveJourneyOptionCatalogId maps fallback option to geometry cache key', async () => {
    const result = await planJourney(null, origin, destination, []);
    const expectedId = String(result.options[0].route_id);
    const catalogId = resolveJourneyOptionCatalogId(result.options[0], []);
    expect(catalogId).toBe(expectedId);
    expect(geometryCacheKey(catalogId!)).toBe(`${GEOMETRY_CACHE_PREFIX}${expectedId}`);
  });

  it('resolveJourneyRouteCatalogId handles numeric route_id and display code', () => {
    const catalog = FALLBACK_ROUTES;
    expect(resolveJourneyRouteCatalogId('A78', catalog)).toBe('78');
    expect(resolveJourneyRouteCatalogId(78, catalog)).toBe('78');
    expect(resolveJourneyRouteCatalogId('99', catalog)).toBeNull();
  });

  it('simulates planWithCoords store update path for fallback journey', async () => {
    const storeRoutes: typeof FALLBACK_ROUTES = [];
    const catalog = effectiveRouteCatalog(storeRoutes);
    const {options, fromFallback} = await planJourney(null, origin, destination, catalog);

    expect(fromFallback).toBe(true);
    const activeRouteId = resolveActiveRouteIdFromJourney(options, catalog);
    expect(activeRouteId).toBe(String(options[0].route_id));

    const geometryId = catalog.find(route => route.id === activeRouteId)?.geometryId ?? activeRouteId;
    expect(geometryCacheKey(String(geometryId))).toBe(`${GEOMETRY_CACHE_PREFIX}${activeRouteId}`);
  });
});
import {
  EMPTY_GEOJSON,
  PUBLISHED_ROUTES_BASE_URL,
  selectInitialJourneyRouteId,
  type Coordinates,
} from '@rutas-morelia/transit-core';
import {
  loadRouteGeometry,
  normalizeRouteGeojson,
  resolveGeometryIdForActiveRoute,
} from '../src/services/geometry.service';
import {planJourney} from '../src/services/journey.service';
import {effectiveRouteCatalog, resolveRouteCatalogId} from '../src/services/route-catalog-id';
import {FALLBACK_ROUTES} from '../src/services/routes.service';
import {useTransitStore} from '../src/stores/transit.store';

const origin: Coordinates = {latitude: 19.7027, longitude: -101.1944};
const destination: Coordinates = {latitude: 19.71, longitude: -101.18};

function routeLayersData(geojson: ReturnType<typeof normalizeRouteGeojson> | null) {
  return geojson ?? EMPTY_GEOJSON;
}

describe('route geometry flow (plan → activate → load → map layer data)', () => {
  beforeEach(() => {
    useTransitStore.setState({
      routes: [],
      activeRouteId: null,
      journeyOptions: [],
      journeyLoading: false,
    });
  });

  it('planWithCoords path activates catalog id then loads geojson for RouteLayers', async () => {
    const storeRoutes: typeof FALLBACK_ROUTES = [];
    const catalog = effectiveRouteCatalog(storeRoutes);
    const {options, fromFallback} = await planJourney(null, origin, destination, catalog);

    expect(fromFallback).toBe(true);
    expect(options.length).toBeGreaterThan(0);

    useTransitStore.getState().setRoutes(catalog);
    const initialRef = selectInitialJourneyRouteId(options);
    expect(initialRef).toBeTruthy();

    useTransitStore.getState().activateRoute(initialRef, catalog);
    const {activeRouteId, routes} = useTransitStore.getState();
    expect(activeRouteId).toBe(resolveRouteCatalogId(initialRef, catalog));
    expect(catalog.some(route => route.id === activeRouteId)).toBe(true);

    const {geometryId, selected} = resolveGeometryIdForActiveRoute(activeRouteId!, routes);
    expect(geometryId).toBeTruthy();

    const fetched = await loadRouteGeometry(geometryId, [PUBLISHED_ROUTES_BASE_URL]);
    expect(fetched).not.toBeNull();
    expect(fetched!.rawGeojson.features.length).toBeGreaterThan(0);

    const normalized = normalizeRouteGeojson(fetched!.rawGeojson, activeRouteId!, selected, 'dark');
    expect(normalized.features[0].properties?.id).toBe(activeRouteId);

    const layerData = routeLayersData(normalized);
    expect(layerData.features.length).toBeGreaterThan(0);
    expect(layerData).not.toBe(EMPTY_GEOJSON);
  }, 30000);

  it('activateRoute with search entity_id resolves geometry for fallback catalog', async () => {
    useTransitStore.getState().setRoutes(FALLBACK_ROUTES);
    useTransitStore.getState().activateRoute('A78', FALLBACK_ROUTES);

    const {activeRouteId, routes} = useTransitStore.getState();
    expect(activeRouteId).toBe('78');

    const {geometryId} = resolveGeometryIdForActiveRoute(activeRouteId!, routes);
    const fetched = await loadRouteGeometry(geometryId, [PUBLISHED_ROUTES_BASE_URL]);
    expect(fetched?.bounds).toHaveLength(4);

    const normalized = normalizeRouteGeojson(
      fetched!.rawGeojson,
      activeRouteId!,
      routes.find(route => route.id === activeRouteId),
      'dark',
    );
    expect(routeLayersData(normalized).features.length).toBeGreaterThan(0);
  }, 30000);
});
import {GEOMETRY_CACHE_PREFIX, type FavoriteItem, type JourneyOption, type RouteItem} from '@rutas-morelia/transit-core';
import {geometryCacheKey} from '../src/services/geometry.service';
import {
  effectiveRouteCatalog,
  resolveActiveRouteIdFromJourney,
  resolveFavoriteRouteCatalogId,
  resolveJourneyOptionCatalogId,
  resolveRouteCatalogId,
} from '../src/services/route-catalog-id';
import {FALLBACK_ROUTES} from '../src/services/routes.service';

const catalog: RouteItem[] = [
  {id: '78', number: 'A78', name: 'Alberca', detail: 'Camión', time: 'x', color: '#FFC800'},
  {id: '3', number: 'A3', name: 'Amarilla', detail: 'Camión', time: 'x', color: '#E5B900'},
];

describe('route activation (unified resolver)', () => {
  const cases: Array<{
    label: string;
    ref: string | number | null | undefined;
    catalog: RouteItem[];
    expected: string | null;
  }> = [
    {label: 'display code A78', ref: 'A78', catalog, expected: '78'},
    {label: 'numeric route_id', ref: 78, catalog, expected: '78'},
    {label: 'raw catalog id', ref: '3', catalog, expected: '3'},
    {label: 'search entity_id as code', ref: 'A3', catalog, expected: '3'},
    {label: 'unknown route', ref: '99', catalog, expected: null},
    {label: 'empty catalog uses FALLBACK_ROUTES', ref: 'A78', catalog: [], expected: '78'},
  ];

  it.each(cases)('$label → $expected', ({ref, catalog: pool, expected}) => {
    expect(resolveRouteCatalogId(ref, pool)).toBe(expected);
    if (expected) {
      expect(geometryCacheKey(expected)).toBe(`${GEOMETRY_CACHE_PREFIX}${expected}`);
    }
  });

  it('favorite route.code A78 resolves to catalog id 78', () => {
    const favorite: FavoriteItem = {id: 1, route_id: 42, route: {id: 42, code: 'A78'}};
    const id = resolveFavoriteRouteCatalogId(favorite, catalog);
    expect(id).toBe('78');
    expect(geometryCacheKey(id!)).toBe(`${GEOMETRY_CACHE_PREFIX}78`);
  });

  it('journey option route_code maps to geometry cache key', () => {
    const option: JourneyOption = {
      route_id: '78',
      route_code: 'A78',
      route_name: 'Alberca',
      transfers: 0,
    };
    const id = resolveJourneyOptionCatalogId(option, catalog);
    expect(id).toBe('78');
    expect(geometryCacheKey(id!)).toBe(`${GEOMETRY_CACHE_PREFIX}78`);
  });

  it('resolveActiveRouteIdFromJourney uses selectInitialJourneyRouteId display code', () => {
    const options: JourneyOption[] = [
      {route_id: '78', route_code: 'A78', route_name: 'Alberca', transfers: 0},
    ];
    expect(resolveActiveRouteIdFromJourney(options, catalog)).toBe('78');
  });

  it('effectiveRouteCatalog never returns empty pool', () => {
    expect(effectiveRouteCatalog([])).toEqual(FALLBACK_ROUTES);
    expect(resolveRouteCatalogId('A78', [])).toBe(
      FALLBACK_ROUTES.find(route => route.number === 'A78')?.id ?? null,
    );
  });
});
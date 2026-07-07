import {
  resolveFavoriteRouteCatalogId,
  togglePlaceFavoriteLocal,
  toggleRouteFavoriteLocal,
} from '../src/services/favorites.service';
import type {RouteItem} from '@rutas-morelia/transit-core';
import {findRouteFavorite, mergeLocalFavorites} from '@rutas-morelia/transit-core';

describe('favorites.service', () => {
  it('toggleRouteFavoriteLocal adds and removes route favorites', () => {
    const added = toggleRouteFavoriteLocal([], '78');
    expect(findRouteFavorite(added, '78')).toBeDefined();
    const removed = toggleRouteFavoriteLocal(added, '78');
    expect(findRouteFavorite(removed, '78')).toBeUndefined();
  });

  it('togglePlaceFavoriteLocal stores coordinates', () => {
    const added = togglePlaceFavoriteLocal([], 'Centro', {latitude: 19.7, longitude: -101.19});
    expect(added[0].custom_name).toBe('Centro');
    expect(added[0].latitude).toBe(19.7);
  });

  it('resolveFavoriteRouteCatalogId maps db code A78 to catalog id 78', () => {
    const routes: RouteItem[] = [
      {id: '78', number: 'A78', name: 'Alberca', detail: 'Camión', time: 'x', color: '#FFC800'},
    ];
    const catalogId = resolveFavoriteRouteCatalogId(
      {id: 1, route_id: 42, route: {id: 42, code: 'A78'}},
      routes,
    );
    expect(catalogId).toBe('78');
  });

  it('resolveFavoriteRouteCatalogId maps numeric route_id to catalog id', () => {
    const routes: RouteItem[] = [
      {id: '3', number: 'A3', name: 'Amarilla', detail: 'Camión', time: 'x', color: '#E5B900'},
    ];
    expect(resolveFavoriteRouteCatalogId({id: 2, route_id: 3}, routes)).toBe('3');
  });

  it('mergeLocalFavorites deduplicates via transit-core helper', () => {
    const remote = [{id: 1, route_id: 78}];
    const local = [{id: 'local_1', route_id: 79, is_local: true}];
    const merged = mergeLocalFavorites(remote, local);
    expect(merged).toHaveLength(2);
  });
});
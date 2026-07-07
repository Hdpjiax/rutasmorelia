import {
  togglePlaceFavoriteLocal,
  toggleRouteFavoriteLocal,
} from '../src/services/favorites.service';
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

  it('mergeLocalFavorites deduplicates via transit-core helper', () => {
    const remote = [{id: 1, route_id: 78}];
    const local = [{id: 'local_1', route_id: 79, is_local: true}];
    const merged = mergeLocalFavorites(remote, local);
    expect(merged).toHaveLength(2);
  });
});
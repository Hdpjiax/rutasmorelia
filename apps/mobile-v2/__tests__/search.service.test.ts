import {searchPlaces, searchRoutesLocally} from '../src/services/search.service';
import type {RouteItem} from '@rutas-morelia/transit-core';

const sampleRoutes: RouteItem[] = [
  {id: '78', number: 'A78', name: 'Alberca Metropolis', detail: 'Camión', time: 'x', color: '#FFC800'},
  {id: '3', number: 'A3', name: 'Amarilla 1 Centro', detail: 'Camión', time: 'x', color: '#E5B900'},
];

describe('search.service', () => {
  it('searchRoutesLocally scores routes by query', () => {
    const results = searchRoutesLocally(sampleRoutes, 'amarilla');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entity_type).toBe('route');
    expect(results[0].label.toLowerCase()).toContain('amarilla');
  });

  it('searchPlaces returns places only (no route fallback)', async () => {
    const results = await searchPlaces(null, 'alberca', sampleRoutes);
    expect(results.every(item => item.entity_type !== 'route')).toBe(true);
  });

  it('searchPlaces returns empty for short queries', async () => {
    const results = await searchPlaces(null, 'a', sampleRoutes);
    expect(results).toEqual([]);
  });
});
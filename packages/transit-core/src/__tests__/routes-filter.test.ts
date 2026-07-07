import {describe, expect, it} from 'vitest';
import {filterRoutesByTransport, isCombiRoute, sortRoutesForDisplay} from '../routes';
import type {RouteItem} from '../types';

const sample: RouteItem[] = [
  {id: '1', geometryId: '1', number: 'A1', name: 'Zona Centro', detail: 'Camión', time: '', color: '#f00'},
  {id: '2', geometryId: '2', number: 'C2', name: 'Alberca', detail: 'Combi', time: '', color: '#0f0', transportType: 'Combi'},
  {id: '3', geometryId: '3', number: 'A3', name: 'Amarilla', detail: 'Camión', time: '', color: '#00f'},
];

describe('filterRoutesByTransport', () => {
  it('filters combis', () => {
    const filtered = filterRoutesByTransport(sample, 'combi');
    expect(filtered).toHaveLength(1);
    expect(isCombiRoute(filtered[0])).toBe(true);
  });

  it('filters camiones', () => {
    const filtered = filterRoutesByTransport(sample, 'camion');
    expect(filtered).toHaveLength(2);
    expect(filtered.every(r => !isCombiRoute(r))).toBe(true);
  });

  it('filters favorites', () => {
    const filtered = filterRoutesByTransport(sample, 'fav', ['2']);
    expect(filtered.map(r => r.id)).toEqual(['2']);
  });
});

describe('sortRoutesForDisplay', () => {
  it('puts camiones before combis', () => {
    const sorted = sortRoutesForDisplay(sample);
    expect(sorted[0].detail).toBe('Camión');
    expect(sorted[sorted.length - 1].detail).toBe('Combi');
  });
});
import type {FeatureCollection} from 'geojson';
import {
  computeGeometryBounds,
  geometryCacheKey,
  normalizeRouteGeojson,
} from '../src/services/geometry.service';
import {GEOMETRY_CACHE_PREFIX} from '@rutas-morelia/transit-core';

const sampleGeojson: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {color: '#FFC800'},
      geometry: {
        type: 'LineString',
        coordinates: [
          [-101.2, 19.7],
          [-101.19, 19.71],
        ],
      },
    },
  ],
};

const route = {
  id: '78',
  number: 'A78',
  name: 'Alberca',
  detail: 'Camión',
  time: 'x',
  color: '#FFC800',
};

describe('geometry.service', () => {
  it('computeGeometryBounds returns lng/lat bounds for line features', () => {
    const bounds = computeGeometryBounds(sampleGeojson);
    expect(bounds).toEqual([-101.2, 19.7, -101.19, 19.71]);
  });

  it('normalizeRouteGeojson stamps route id and produces hex color in dark mode', () => {
    const normalized = normalizeRouteGeojson(sampleGeojson, '78', route, 'dark');
    expect(normalized.features[0].properties?.id).toBe('78');
    const color = String(normalized.features[0].properties?.color);
    expect(color).toMatch(/^#[0-9A-F]{6}$/i);
    const light = normalizeRouteGeojson(sampleGeojson, '78', route, 'light');
    expect(light.features[0].properties?.color).toBe('#FFC800');
  });

  it('normalizeRouteGeojson preserves route color in light mode', () => {
    const normalized = normalizeRouteGeojson(sampleGeojson, '78', route, 'light');
    expect(normalized.features[0].properties?.color).toBe('#FFC800');
  });

  it('geometryCacheKey prefixes geometry id with transit-core constant', () => {
    expect(geometryCacheKey('78')).toBe(`${GEOMETRY_CACHE_PREFIX}78`);
  });
});
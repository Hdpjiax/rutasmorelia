import type {FeatureCollection} from 'geojson';
import {isValidLngLat, sanitizeRouteLineGeojson} from '../src/lib/map-geo';

describe('map-geo', () => {
  it('isValidLngLat rejects invalid coordinates', () => {
    expect(isValidLngLat(null)).toBe(false);
    expect(isValidLngLat([NaN, 19.7])).toBe(false);
    expect(isValidLngLat([-101.19, 19.71])).toBe(true);
  });

  it('sanitizeRouteLineGeojson drops invalid line features', () => {
    const geojson: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {type: 'LineString', coordinates: [[-101.2, 19.7]]},
        },
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
        {
          type: 'Feature',
          properties: {},
          geometry: {type: 'Point', coordinates: [-101.2, 19.7]},
        },
      ],
    };

    const sanitized = sanitizeRouteLineGeojson(geojson);
    expect(sanitized?.features).toHaveLength(1);
    expect(sanitized?.features[0].properties?.color).toBe('#FFC800');
  });
});
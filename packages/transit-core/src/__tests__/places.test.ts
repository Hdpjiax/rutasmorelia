import {describe, expect, it} from 'vitest';
import {mapPhotonFeatures, parseLocationField} from '../places';

describe('places', () => {
  it('parses WKT, GeoJSON, and Supabase EWKB hex locations', () => {
    expect(parseLocationField('POINT(-101.2 19.7)')).toEqual({
      latitude: 19.7,
      longitude: -101.2,
    });
    expect(
      parseLocationField({type: 'Point', coordinates: [-101.1, 19.6]}),
    ).toEqual({
      latitude: 19.6,
      longitude: -101.1,
    });
    expect(
      parseLocationField(
        '0101000020E610000075931804564C59C06B48DC63E9B33340',
      ),
    ).toEqual({
      latitude: 19.70278,
      longitude: -101.19275,
    });
    expect(parseLocationField(null)).toBeNull();
  });

  it('maps photon features to suggestions', () => {
    const suggestions = mapPhotonFeatures([
      {
        properties: {
          name: 'Centro',
          city: 'Morelia',
          state: 'Michoacán',
          osm_type: 'N',
          osm_id: 42,
        },
        geometry: {coordinates: [-101.19, 19.7]},
      },
    ]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      entity_type: 'place',
      label: 'Centro',
      latitude: 19.7,
      longitude: -101.19,
    });
  });
});
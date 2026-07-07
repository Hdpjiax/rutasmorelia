import {buildGeojsonUrl} from '../src/lib/routes-config';
import {
  FALLBACK_ROUTES,
  mapRoutesFromIndex,
  parseRoutesIndex,
} from '../src/services/routes.service';

describe('routes.service', () => {
  it('parseRoutesIndex extracts valid route entries', () => {
    const payload = {
      routes: [
        {id: '78', name: 'Alberca', color: '#FFC800', transportType: 'Camion'},
        {id: null, name: 'Invalid'},
        {name: 'No id'},
      ],
    };
    const parsed = parseRoutesIndex(payload);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({id: '78', name: 'Alberca'});
  });

  it('mapRoutesFromIndex uses transit-core formatting', () => {
    const mapped = mapRoutesFromIndex([{id: '3', name: 'Amarilla 1', color: '#E5B900', transportType: 'Camion'}]);
    expect(mapped[0].number).toBe('A3');
    expect(mapped[0].detail).toBe('Camión');
  });

  it('buildGeojsonUrl resolves published geometry path', () => {
    const url = buildGeojsonUrl('https://www.viamorelia.org/routes', '78');
    expect(url).toBe('https://www.viamorelia.org/routes/78.geojson');
  });

  it('FALLBACK_ROUTES provides offline catalog', () => {
    expect(FALLBACK_ROUTES.length).toBeGreaterThan(0);
    expect(FALLBACK_ROUTES[0].id).toBeTruthy();
  });
});
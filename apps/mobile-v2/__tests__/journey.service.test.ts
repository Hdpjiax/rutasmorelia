import type {Coordinates, RouteItem} from '@rutas-morelia/transit-core';
import {
  buildFallbackJourneyOptions,
  planJourney,
  pickFallbackRoute,
} from '../src/services/journey.service';
import {FALLBACK_ROUTES} from '../src/services/routes.service';

const origin: Coordinates = {latitude: 19.7027, longitude: -101.1944};
const destination: Coordinates = {latitude: 19.71, longitude: -101.18};

const catalog: RouteItem[] = [
  {id: '78', number: 'A78', name: 'Alberca', detail: 'Camión', time: 'x', color: '#FFC800'},
  {id: '3', number: 'A3', name: 'Amarilla', detail: 'Camión', time: 'x', color: '#E5B900'},
];

describe('journey.service', () => {
  it('buildFallbackJourneyOptions returns a direct option from catalog', () => {
    const options = buildFallbackJourneyOptions(origin, destination, catalog);
    expect(options).toHaveLength(1);
    expect(catalog.some(route => route.id === String(options[0].route_id))).toBe(true);
    expect(options[0].transfers).toBe(0);
    expect(options[0].boarding_stop_name).toContain('Parada');
  });

  it('pickFallbackRoute chooses from provided catalog', () => {
    const route = pickFallbackRoute(origin, destination, catalog);
    expect(catalog.some(item => item.id === route.id)).toBe(true);
  });

  it('planJourney without Supabase returns fallback options', async () => {
    const result = await planJourney(null, origin, destination, catalog);
    expect(result.fromFallback).toBe(true);
    expect(result.error).toBeNull();
    expect(result.options.length).toBeGreaterThan(0);
    expect(catalog.some(route => route.id === String(result.options[0].route_id))).toBe(true);
  });

  it('planJourney falls back when remote invoke fails', async () => {
    const client = {
      functions: {
        invoke: async () => {
          throw new Error('network');
        },
      },
    };
    const result = await planJourney(client as never, origin, destination, catalog);
    expect(result.fromFallback).toBe(true);
    expect(result.options.length).toBeGreaterThan(0);
  });

  it('planJourney uses remote options when invoke succeeds', async () => {
    const remoteOptions = [{route_id: 99, route_name: 'Remota', transfers: 0}];
    const client = {
      functions: {
        invoke: async () => ({data: {data: remoteOptions}, error: null}),
      },
    };
    const result = await planJourney(client as never, origin, destination, FALLBACK_ROUTES);
    expect(result.fromFallback).toBe(false);
    expect(result.options[0].route_name).toBe('Remota');
  });
});
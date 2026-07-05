import {describe, expect, it, vi} from 'vitest';
import {resolveSuggestionCoords, type TransitDataClient} from '../resolve-suggestion';
import type {FavoriteItem, Suggestion} from '../types';

describe('resolveSuggestionCoords', () => {
  it('returns inline coordinates when present', async () => {
    const suggestion: Suggestion = {
      entity_type: 'place',
      entity_id: 1,
      label: 'Centro',
      subtitle: null,
      latitude: 19.7,
      longitude: -101.2,
    };
    await expect(resolveSuggestionCoords(null, suggestion)).resolves.toEqual({
      latitude: 19.7,
      longitude: -101.2,
    });
  });

  it('resolves local favorites without a client', async () => {
    const favorites: FavoriteItem[] = [
      {id: 'local_1', custom_name: 'Casa', latitude: 19.1, longitude: -101.1},
    ];
    const suggestion: Suggestion = {
      entity_type: 'place',
      entity_id: 999999,
      label: 'Casa',
      subtitle: null,
      latitude: null,
      longitude: null,
    };
    await expect(resolveSuggestionCoords(null, suggestion, favorites)).resolves.toEqual({
      latitude: 19.1,
      longitude: -101.1,
    });
  });

  it('fetches stop coordinates from the data client', async () => {
    const client: TransitDataClient = {
      fetchStopLocation: vi.fn().mockResolvedValue('POINT(-101.3 19.8)'),
      fetchPlaceLocation: vi.fn(),
    };
    const suggestion: Suggestion = {
      entity_type: 'stop',
      entity_id: 42,
      label: 'Parada 42',
      subtitle: null,
      latitude: null,
      longitude: null,
    };
    await expect(resolveSuggestionCoords(client, suggestion)).resolves.toEqual({
      latitude: 19.8,
      longitude: -101.3,
    });
    expect(client.fetchStopLocation).toHaveBeenCalledWith(42);
  });
});
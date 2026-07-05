import {describe, expect, it} from 'vitest';
import {
  countJourneyOptions,
  filterJourneyOptions,
  hasTransfers,
  selectInitialJourneyRouteId,
  selectInitialJourneyTab,
} from '../journey';
import type {JourneyOption} from '../types';

const direct: JourneyOption = {
  route_id: 1,
  route_name: 'Ruta A',
  transfers: 0,
};

const transfer: JourneyOption = {
  route_id: 2,
  route_name: 'Ruta B',
  second_route_name: 'Ruta C',
  transfers: 1,
};

describe('journey', () => {
  it('detects transfers', () => {
    expect(hasTransfers(direct)).toBe(false);
    expect(hasTransfers(transfer)).toBe(true);
  });

  it('filters by tab', () => {
    const options = [direct, transfer];
    expect(filterJourneyOptions(options, 'direct')).toEqual([direct]);
    expect(filterJourneyOptions(options, 'transfer')).toEqual([transfer]);
    expect(countJourneyOptions(options, 'direct')).toBe(1);
  });

  it('selects initial tab and route', () => {
    expect(selectInitialJourneyTab([transfer])).toBe('transfer');
    expect(selectInitialJourneyTab([direct, transfer])).toBe('direct');
    expect(selectInitialJourneyRouteId([direct])).toBe('1');
  });
});
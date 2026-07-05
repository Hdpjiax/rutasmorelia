import {describe, expect, it} from 'vitest';
import {expandSearchQuery, normalizeString, scoreRoutesByQuery} from '../search';

describe('search', () => {
  it('normalizes accented strings', () => {
    expect(normalizeString('Av. Lázaro Cárdenas')).toBe('av lazaro cardenas');
  });

  it('expands common abbreviations', () => {
    const variants = expandSearchQuery('Blvd. Madero');
    expect(variants).toContain('Blvd. Madero');
    expect(variants.some(v => v.toLowerCase().includes('boulevard'))).toBe(true);
  });

  it('scores routes by query', () => {
    const routes = [
      {id: '12', name: 'Centro - Tarímbaro'},
      {id: '99', name: 'Periférico Norte'},
    ];
    const matches = scoreRoutesByQuery(routes, 'centro');
    expect(matches[0]?.name).toBe('Centro - Tarímbaro');
  });
});
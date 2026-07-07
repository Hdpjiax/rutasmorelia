import {describe, expect, it} from 'vitest';
import {MORELIA_CENTER} from '../constants';
import {isWithinMoreliaMetro} from '../geo';

describe('isWithinMoreliaMetro', () => {
  it('accepts center', () => {
    expect(isWithinMoreliaMetro(MORELIA_CENTER)).toBe(true);
  });

  it('rejects far coordinates', () => {
    expect(isWithinMoreliaMetro({latitude: 20.5, longitude: -100})).toBe(false);
  });
});
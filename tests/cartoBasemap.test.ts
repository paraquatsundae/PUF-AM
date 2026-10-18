import { describe, expect, it } from 'vitest';
import { cartoTileUrl } from '../src/lib/cartoBasemap';

describe('cartoTileUrl', () => {
  it('leaves the template alone when there is no key', () => {
    expect(cartoTileUrl('light_all', '')).toBe(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    );
    expect(cartoTileUrl('light_all', '   ')).toBe(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    );
  });

  it('adds the key as a query parameter', () => {
    expect(cartoTileUrl('rastertiles/voyager_only_labels', 'abc def')).toBe(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png?key=abc%20def',
    );
  });
});

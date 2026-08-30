import { describe, expect, it } from 'vitest';
import { farmMapNameMatches, matchFarmMapSearch } from './farmMapSearch';

const items = {
  blocks: [{ id: 'b1', name: 'North Ridge' }],
  tracks: [{ id: 't1', name: 'Main Access' }],
  pins: [{ id: 'p1', name: 'North dam' }],
};

describe('matchFarmMapSearch', () => {
  it('matches a paddock before tracks and pins', () => {
    expect(matchFarmMapSearch('north', items)).toEqual({ kind: 'block', id: 'b1' });
  });

  it('matches a track when no paddock hits', () => {
    expect(matchFarmMapSearch('access', items)).toEqual({ kind: 'track', id: 't1' });
  });

  it('matches a pin when no paddock or track hits', () => {
    expect(matchFarmMapSearch('dam', items)).toEqual({ kind: 'pin', id: 'p1' });
  });

  it('returns null for an empty or unknown query', () => {
    expect(matchFarmMapSearch('  ', items)).toBeNull();
    expect(matchFarmMapSearch('xyz', items)).toBeNull();
  });
});

describe('farmMapNameMatches', () => {
  it('is case-insensitive and ignores surrounding space', () => {
    expect(farmMapNameMatches('North Ridge', '  ridge ')).toBe(true);
    expect(farmMapNameMatches('North Ridge', '')).toBe(false);
    expect(farmMapNameMatches(undefined, 'north')).toBe(false);
  });
});

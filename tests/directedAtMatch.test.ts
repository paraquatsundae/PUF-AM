import { describe, expect, it } from 'vitest';
import { directedAtIsEmpty, isDirectedAtYou } from '../src/lib/directedAtMatch';

describe('directedAtMatch', () => {
  it('treats blank uid+name as empty (Everyone)', () => {
    expect(directedAtIsEmpty(undefined, undefined)).toBe(true);
    expect(directedAtIsEmpty('', '  ')).toBe(true);
    expect(directedAtIsEmpty('u1', '')).toBe(false);
  });

  it('matches uid first, then a display name', () => {
    expect(
      isDirectedAtYou({
        directedAtUid: 'u1',
        directedAtName: 'Pat',
        personUid: 'u1',
        personNames: ['Dave'],
      })
    ).toBe(true);
    expect(
      isDirectedAtYou({
        directedAtName: 'Dave',
        personUid: 'u2',
        personNames: [' dave '],
      })
    ).toBe(true);
    expect(
      isDirectedAtYou({
        directedAtName: 'Pat',
        personUid: 'u2',
        personNames: ['Dave'],
      })
    ).toBe(false);
    expect(
      isDirectedAtYou({
        personUid: 'u1',
        personNames: ['Dave'],
      })
    ).toBe(false);
  });
});

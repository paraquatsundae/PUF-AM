import { describe, expect, it } from 'vitest';
import { SHADE_CLASS, shadeForFraction } from '../shared/shadeForFraction';

describe('shadeForFraction', () => {
  it('steps red, orange, yellow, cyan, then blue at the boundaries', () => {
    expect(shadeForFraction(0)).toBe('red');
    expect(shadeForFraction(0.249)).toBe('red');
    expect(shadeForFraction(0.25)).toBe('orange');
    expect(shadeForFraction(0.499)).toBe('orange');
    expect(shadeForFraction(0.5)).toBe('yellow');
    expect(shadeForFraction(0.749)).toBe('yellow');
    expect(shadeForFraction(0.75)).toBe('cyan');
    expect(shadeForFraction(0.999)).toBe('cyan');
    expect(shadeForFraction(1)).toBe('blue');
    expect(shadeForFraction(1.375)).toBe('blue');
  });

  it('keeps the old 25/50/75/100 cuts of a requirement', () => {
    const required = 40;
    expect(shadeForFraction(0 / required)).toBe('red');
    expect(shadeForFraction(9.9 / required)).toBe('red');
    expect(shadeForFraction(10 / required)).toBe('orange');
    expect(shadeForFraction(19.9 / required)).toBe('orange');
    expect(shadeForFraction(20 / required)).toBe('yellow');
    expect(shadeForFraction(29.9 / required)).toBe('yellow');
    expect(shadeForFraction(30 / required)).toBe('cyan');
    expect(shadeForFraction(39.9 / required)).toBe('cyan');
    expect(shadeForFraction(40 / required)).toBe('blue');
    expect(shadeForFraction(55 / required)).toBe('blue');
  });

  it('treats a non-finite or negative fraction as red', () => {
    expect(shadeForFraction(Number.NaN)).toBe('red');
    expect(shadeForFraction(Number.POSITIVE_INFINITY)).toBe('red');
    expect(shadeForFraction(Number.NEGATIVE_INFINITY)).toBe('red');
    expect(shadeForFraction(-0.01)).toBe('red');
  });

  it('maps each shade to one background class', () => {
    expect(SHADE_CLASS).toEqual({
      red: 'bg-red-100',
      orange: 'bg-orange-100',
      yellow: 'bg-yellow-100',
      cyan: 'bg-cyan-100',
      blue: 'bg-blue-100',
    });
  });
});

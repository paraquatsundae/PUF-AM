import { describe, expect, it } from 'vitest';
import { resolveCultivarTarget } from '../src/lib/chillPortions';

describe('resolveCultivarTarget', () => {
  it('matches cultivar name case-insensitively', () => {
    expect(resolveCultivarTarget('Chandler').requiredCP).toBe(45);
    expect(resolveCultivarTarget('franquette').requiredCP).toBe(55);
  });

  it('falls back for unknown cultivars', () => {
    const t = resolveCultivarTarget('Mystery');
    expect(t.name).toBe('Mystery');
    expect(t.requiredCP).toBe(45);
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL_PARAMS } from '../src/lib/modelParameters';

describe('modelParameters', () => {
  it('defaults orchard inoculum to medium (Ji k = 1)', () => {
    expect(DEFAULT_MODEL_PARAMS.orchardInoculumLevel).toBe('medium');
  });

  it('keeps sandbox and economics fields on the same doc shape', () => {
    expect(DEFAULT_MODEL_PARAMS.blightSensitivity).toBe(0.85);
    expect(DEFAULT_MODEL_PARAMS.marketPrice).toBe(3.3);
    expect(DEFAULT_MODEL_PARAMS.chemEfficacy).toBe(95);
  });
});

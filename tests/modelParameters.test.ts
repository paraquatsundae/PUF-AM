import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL_PARAMS,
  pickEconomicsModelParams,
  pickResearchModelParams,
} from '../src/lib/modelParameters';

describe('modelParameters', () => {
  it('defaults orchard inoculum to medium (Ji k = 1)', () => {
    expect(DEFAULT_MODEL_PARAMS.orchardInoculumLevel).toBe('medium');
  });

  it('keeps sandbox and economics fields on the same doc shape', () => {
    expect(DEFAULT_MODEL_PARAMS.blightSensitivity).toBe(0.85);
    expect(DEFAULT_MODEL_PARAMS.marketPrice).toBe(3.3);
    expect(DEFAULT_MODEL_PARAMS.chemEfficacy).toBe(95);
  });

  it('splits research vs economics picks without dragging inoculum into research writes', () => {
    const research = pickResearchModelParams(DEFAULT_MODEL_PARAMS);
    const economics = pickEconomicsModelParams(DEFAULT_MODEL_PARAMS);
    expect(research).not.toHaveProperty('orchardInoculumLevel');
    expect(research).not.toHaveProperty('marketPrice');
    expect(research.blightSensitivity).toBe(0.85);
    expect(economics).toEqual({
      marketPrice: 3.3,
      harvestCostPerKg: 0.45,
      waterCostPerML: 150,
    });
  });
});

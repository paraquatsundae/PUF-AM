import { describe, expect, it } from 'vitest';
import { example, estimateYield, tgwFromHlw } from './estimateYield';
import { isWheatScoutPaddock } from './wheatPaddock';

describe('wheat yield estimate', () => {
  it('matches the Wheat Yield app opening numbers', () => {
    const result = example();
    expect(result.grainsPerHead).toBe(60);
    expect(result.grainsPerM2).toBe(19200);
    expect(result.halfLitreCupGrams).toBe(370);
    expect(result.estimatedThousandGrainWeight).toBe(40);
    expect(result.countedTonnesPerHa).toBeCloseTo(7.68);
    expect(result.tonnesPerHa).toBeCloseTo(6.912);
    expect(result.totalTonnes).toBeCloseTo(691.2);
    expect(result.note).toMatch(/Plausible/);
  });

  it('doubles one side of the head and lets a weighed TGW override hectolitre', () => {
    expect(tgwFromHlw(74)).toBe(40);
    const result = estimateYield({
      counts: [{ heads: 10, height: 10, width: 4 }],
      hectolitreWeight: 74,
      deductionPercent: 0,
      hectares: 1,
      thousandGrainWeightOverride: 50,
    });
    expect(result.grainsPerHead).toBe(80);
    expect(result.thousandGrainWeightUsed).toBe(50);
    expect(result.countedTonnesPerHa).toBeCloseTo(0.4);
  });

  it('averages several square-metre counts once', () => {
    const result = estimateYield({
      counts: [
        { heads: 100, height: 8, width: 2 },
        { heads: 300, height: 12, width: 4 },
      ],
      hectolitreWeight: 74,
      deductionPercent: 0,
      hectares: 2,
    });
    expect(result.meanHeadsPerM2).toBe(200);
    expect(result.meanHeight).toBe(10);
    expect(result.meanWidth).toBe(3);
    expect(result.countCount).toBe(2);
  });
});

describe('wheat scout paddocks', () => {
  it('offers wheat and unnamed broadacre, not a named other crop', () => {
    expect(isWheatScoutPaddock({ cropKind: 'broadacre', cultivar: 'Wheat' })).toBe(true);
    expect(isWheatScoutPaddock({ cropKind: 'broadacre', cultivar: '' })).toBe(true);
    expect(isWheatScoutPaddock({ cropKind: 'broadacre', cultivar: 'Barley' })).toBe(false);
    expect(isWheatScoutPaddock({ cropKind: 'orchard_tree', cultivar: 'Howard' })).toBe(false);
    expect(isWheatScoutPaddock({ seasonLabel: '2026 wheat' })).toBe(true);
  });
});

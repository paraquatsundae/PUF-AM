import { describe, expect, it } from 'vitest';
import { chillCultivars } from '../../../shared/farm/chillPortionsPackage';
import {
  CHILL_VARIETY_REQUIREMENTS,
  chillRequirementLabel,
  chillVarietiesOnBlock,
  lookupChillRequirement,
} from './chillCrops';

describe('lookupChillRequirement', () => {
  it('uses the calculator bands for walnut varieties the pack lists', () => {
    expect(lookupChillRequirement('Chandler')).toMatchObject({
      cropId: 'walnut',
      requiredCP: 65,
      rangeCP: { min: 65, max: 75 },
    });
    expect(chillRequirementLabel(lookupChillRequirement('Chandler')!)).toBe('65–75 CP');
    expect(lookupChillRequirement('Howard')).toMatchObject({
      requiredCP: 65,
      rangeCP: { min: 65, max: 75 },
    });
    expect(lookupChillRequirement('Tulare')).toMatchObject({
      requiredCP: 60,
      rangeCP: { min: 60, max: 70 },
    });
    expect(lookupChillRequirement('Payne')).toMatchObject({
      requiredCP: 64,
      rangeCP: { min: 64, max: 72 },
    });
    expect(chillRequirementLabel(lookupChillRequirement('Payne')!)).toBe('64–72 CP');
    expect(lookupChillRequirement('hartley')).toMatchObject({
      requiredCP: 50,
      rangeCP: { min: 50, max: 58 },
    });
    expect(lookupChillRequirement('Franquette')).toMatchObject({
      requiredCP: 70,
      rangeCP: { min: 70, max: 85 },
    });
    expect(chillRequirementLabel(lookupChillRequirement('Franquette')!)).toBe('70–85 CP');
  });

  it('agrees with engine.json for every walnut the pack lists', () => {
    for (const cultivar of chillCultivars) {
      expect(lookupChillRequirement(cultivar.name)).toMatchObject({
        cropId: 'walnut',
        id: cultivar.id,
        name: cultivar.name,
        requiredCP: cultivar.requiredCP,
        rangeCP: cultivar.rangeCP,
      });
    }
  });

  it('uses the standalone calculator band for varieties this pack did not already list', () => {
    expect(lookupChillRequirement('Serr')).toMatchObject({
      cropName: 'Walnut',
      requiredCP: 45,
      rangeCP: { min: 45, max: 60 },
    });
    expect(lookupChillRequirement('Nonpareil')).toMatchObject({
      cropId: 'almond',
      requiredCP: 20,
      rangeCP: { min: 20, max: 26 },
    });
    expect(lookupChillRequirement('  lapins ')?.requiredCP).toBe(32);
    expect(lookupChillRequirement('ferragnes')).toMatchObject({
      name: 'Ferragnès',
      requiredCP: 28,
    });
    expect(lookupChillRequirement('Kerman')?.requiredCP).toBe(52);
    expect(lookupChillRequirement('Golden Delicious')).toMatchObject({
      cropId: 'apple',
      requiredCP: 46,
      rangeCP: { min: 46, max: 56 },
    });
    expect(chillRequirementLabel(lookupChillRequirement('Nonpareil')!)).toBe('20–26 CP');
    expect(lookupChillRequirement('Vina')).toMatchObject({ requiredCP: 38 });
    expect(lookupChillRequirement('Lara')?.requiredCP).toBe(45);
    expect(lookupChillRequirement('Cisco')?.requiredCP).toBe(45);
  });

  it('lists farm varieties that have no published requirement, and unknown names', () => {
    const crops = new Set(CHILL_VARIETY_REQUIREMENTS.map((row) => row.cropId));
    expect(crops).toEqual(
      new Set([
        'walnut',
        'almond',
        'avocado',
        'olive',
        'citrus',
        'apple',
        'pear',
        'cherry',
        'grape',
        'apricot',
        'peach',
        'nectarine',
        'pistachio',
      ])
    );
    expect(lookupChillRequirement('Carmel')).toMatchObject({
      cropId: 'almond',
      requiredCP: null,
    });
    expect(lookupChillRequirement('Bing')?.requiredCP).toBeNull();
    expect(lookupChillRequirement('Pink Lady')?.requiredCP).toBeNull();
    expect(lookupChillRequirement('Hass')?.requiredCP).toBeNull();
    expect(chillRequirementLabel(lookupChillRequirement('Carmel')!)).toBeNull();
    expect(lookupChillRequirement('Mystery')).toBeNull();
    expect(lookupChillRequirement('')).toBeNull();
    expect(lookupChillRequirement('   ')).toBeNull();
  });
});

describe('chillVarietiesOnBlock', () => {
  it('uses the block cultivar when nothing is drawn inside the paddock', () => {
    expect(chillVarietiesOnBlock({ cultivar: 'Howard' })).toEqual([
      { cultivar: 'Howard', rest: false },
    ]);
    expect(chillVarietiesOnBlock({ cultivar: '  ' })).toEqual([{ cultivar: '', rest: false }]);
  });

  it('lists each drawn variety and the rest of the paddock under the block cultivar', () => {
    expect(
      chillVarietiesOnBlock({
        cultivar: 'Howard',
        cultivarParts: [{ cultivar: 'Tulare' }, { cultivar: ' Chandler ' }],
      })
    ).toEqual([
      { cultivar: 'Tulare', rest: false },
      { cultivar: 'Chandler', rest: false },
      { cultivar: 'Howard', rest: true },
    ]);
  });
});
